# Browser test of the whole site with two people.  python3 tests/e2e.py   (or TARGET=worker python3 tests/e2e.py)
# Needs: pip install playwright && playwright install chromium; and npm run build first.
import subprocess, time, os, tempfile, datetime, sys, re
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET=os.environ.get('TARGET','node')
from playwright.sync_api import sync_playwright
d=tempfile.mkdtemp()
env=dict(os.environ, PORT='3222', WINGMATE_DATA_DIR=d, WINGMATE_TRUST_PROXY='0', HARNESS_SMTP='1' if TARGET=='worker' else '0')
entry='scripts/worker-harness/run.mjs' if TARGET=='worker' else 'server-dist/server.mjs'
srv=subprocess.Popen(['node',entry],cwd=ROOT,env=env,stdout=subprocess.DEVNULL if TARGET=='worker' else None)
time.sleep(1.5)
B='http://localhost:3222/airasia/'
ok=0;bad=[]
def check(n,c):
    global ok
    if c: ok+=1
    else: bad.append(n); print('FAIL',n)
now=datetime.datetime.now()
dep=(now+datetime.timedelta(days=2)).replace(hour=9,minute=0)
arr=dep+datetime.timedelta(hours=4)
fmt=lambda x:x.strftime('%Y-%m-%dT%H:%M')
def signup(page,first,email):
    page.goto(B+'signup.html')
    page.fill('#first',first); page.fill('#last','Tester'); page.fill('#email',email)
    page.fill('#phone','91234567'); page.fill('#dob','1999-01-01')
    page.fill('#pw','Wing#Mate24'); page.fill('#pw2','Wing#Mate24'); page.check('#terms')
    page.click('button[type=submit]')
    pass
def a_text(pg): return pg.inner_text('#card')
def link(email,page):
    t=open(d+'/outbox/outbox.txt').read().split('=== ')
    t=[b for b in t if 'To: '+email+'\n' in b and '/'+page+'.html#token=' in b]
    return re.search(r'/airasia/'+page+r'\.html#token=([\w-]+)',t[-1]).group(1)
def login(page,email,pw='Wing#Mate24'):
    page.goto(B+'login.html'); page.fill('#email',email); page.fill('#pw',pw); page.click('button[type=submit]')
def add_flight(page):
    page.wait_for_selector('#flightBtn',state='visible')
    page.click('#flightBtn')
    page.fill('#fNumber','AK 123'); page.fill('#fDate',dep.strftime('%Y-%m-%d'))
    page.fill('#fFrom','KUL'); page.fill('#fTo','HKG')
    page.fill('#fDep',dep.strftime('%H:%M'))
    page.click('#flightForm button[type=submit]')
    page.wait_for_selector('#flightModal',state='hidden')
try:
    with sync_playwright() as p:
        br=p.chromium.launch()
        errs=[]
        ctxs=[br.new_context(),br.new_context()]
        pages=[c.new_page() for c in ctxs]
        for pg in pages: pg.on('pageerror',lambda e:errs.append(str(e)))
        for pg,(f,e) in zip(pages,[('Alice','alice@example.com'),('Bob','bob@example.com')]):
            signup(pg,f,e)
        time.sleep(1.5)
        check('signup shows check-email card', 'Check your email' in a_text(pages[0]))
        # unverified login is refused with a resend link
        login(pages[0],'alice@example.com'); time.sleep(0.8)
        check('unverified login blocked', pages[0].is_visible('#banner') and pages[0].is_visible('#resend'))
        for pg,e in zip(pages,['alice@example.com','bob@example.com']):
            pg.goto(B+'verify.html#token='+link(e,'verify')); pg.wait_for_selector('#go',state='visible',timeout=5000)
            check('verify page confirms', 'confirmed' in pg.inner_text('#card'))
            login(pg,e); pg.wait_for_url('**/dashboard.html',timeout=5000)
        # the same link cannot be used twice
        pages[0].goto(B+'verify.html#token='+link('alice@example.com','verify')); time.sleep(1)
        check('verify link single use', 'did not work' in pages[0].inner_text('#card'))
        for pg in pages: pg.goto(B+'dashboard.html'); 
        a,b=pages
        a.wait_for_selector('section.is-active'); b.wait_for_selector('section.is-active')
        check('welcome name', 'Alice' in a.inner_text('#hello'))
        check('empty state before flight','Add your flight' in a.inner_text('#topMatches'))
        add_flight(a)
        check('route shown', a.inner_text('#routeFrom')=='KUL')
        add_flight(b)
        time.sleep(10)
        check('alice sees bob','Bob T' in a.inner_text('#topMatches'))
        # alice connects
        a.click('#topMatches [data-act=connect]')
        time.sleep(0.5)
        check('request sent label','Request sent' in a.inner_text('#topMatches'))
        time.sleep(10)
        check('bob sees incoming','Accept' in b.inner_text('#topMatches'))
        b.click('#topMatches [data-act=accept]')
        time.sleep(10)
        check('alice connected','Message' in a.inner_text('#topMatches'))
        # chat
        a.click('#topMatches [data-act=message]')
        a.wait_for_selector('#msgInput')
        a.fill('#msgInput','hello bob'); a.press('#msgInput','Enter')
        time.sleep(0.8)
        check('alice bubble','hello bob' in a.inner_text('#thread'))
        time.sleep(10)
        check('bob nav dot', b.is_visible('#navDot'))
        b.goto(B+'dashboard.html#messages'); b.wait_for_selector('#bubbles',timeout=5000)
        check('bob got message','hello bob' in b.inner_text('#thread'))
        b.fill('#msgInput','hi alice'); b.press('#msgInput','Enter')
        time.sleep(3.5)
        check('alice got reply','hi alice' in a.inner_text('#thread'))
        # persistence
        a.reload(); a.wait_for_selector('section.is-active'); time.sleep(0.5)
        a.goto(B+'dashboard.html#messages'); a.wait_for_selector('#bubbles',timeout=5000)
        check('history persists','hello bob' in a.inner_text('#thread') and 'hi alice' in a.inner_text('#thread'))
        # prefs save
        a.goto(B+'dashboard.html#prefs'); a.wait_for_selector('#optSeat')
        a.check('input[name=pref-seat][value=Aisle]'); a.click('#prefSave')
        time.sleep(0.8); a.reload(); a.goto(B+'dashboard.html#prefs'); a.wait_for_selector('#optSeat')
        check('prefs persisted', a.is_checked('input[name=pref-seat][value=Aisle]'))
        # profile
        a.goto(B+'dashboard.html#profile'); a.wait_for_selector('#pfBio')
        a.fill('#pfBio','I love ramen'); a.click('#pfSave'); time.sleep(0.8)
        # block
        a.goto(B+'dashboard.html#messages'); a.wait_for_selector('[data-block]')
        a.click('[data-block]'); time.sleep(3)
        check('blocked gone from alice', 'Bob' not in a.inner_text('#convs'))
        b.goto(B+'dashboard.html'); b.wait_for_selector('section.is-active'); time.sleep(0.5)
        check('alice hidden from bob','Alice' not in b.inner_text('#topMatches'))
        # logout / auth guard
        c=br.new_context().new_page(); c.goto(B+'dashboard.html'); c.wait_for_url('**/login.html',timeout=5000)
        check('auth guard redirects', 'login' in c.url)
        a.goto(B+'dashboard.html#profile'); a.wait_for_selector('#logoutBtn'); a.click('#logoutBtn'); a.wait_for_url('**/login.html')
        a.goto(B+'forgot.html'); a.fill('#email','alice@example.com'); a.click('button[type=submit]'); time.sleep(1)
        check('forgot shows check-email', 'Check your email' in a.inner_text('#card'))
        a.goto(B+'reset.html#token='+link('alice@example.com','reset')); a.fill('#pw','New#Pass2026'); a.fill('#pw2','New#Pass2026'); a.click('button[type=submit]'); time.sleep(1)
        check('reset shows success', 'Password changed' in a.inner_text('#card'))
        login(a,'alice@example.com','Wing#Mate24'); time.sleep(0.8)
        check('old password rejected after reset', a.is_visible('#banner'))
        a.fill('#pw','New#Pass2026'); a.click('button[type=submit]'); a.wait_for_url('**/dashboard.html',timeout=5000)
        check('new password works', 'dashboard' in a.url)
        a.goto(B+'dashboard.html#profile'); a.wait_for_selector('#logoutBtn',state='visible'); a.click('#logoutBtn'); a.wait_for_url('**/login.html')
        a.fill('#email','alice@example.com'); a.fill('#pw','wrong'); a.click('button[type=submit]'); time.sleep(0.8)
        check('bad login banner', a.is_visible('#banner'))
        a.fill('#pw','New#Pass2026'); a.click('button[type=submit]'); a.wait_for_url('**/dashboard.html',timeout=5000)
        check('login works','dashboard' in a.url)
        check('no js errors', not errs)
        if errs: print(errs)
        br.close()
finally:
    srv.terminate()
print(ok,'passed',bad)
