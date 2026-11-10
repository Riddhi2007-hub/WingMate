export interface UserRow {
  id: number;
  email: string;
  email_verified: number;
  pw_hash: string;
  first: string;
  last: string;
  phone: string;
  dob: string;
  bio: string;
  visible: number;
  p_type: string;
  p_why: string;
  p_pers: string;
  p_interests: string;
  p_awake: string;
  p_seat: string;
  criteria: string;
  save_data: number;
  flyer_num: string | null;
  flyer_tier: string | null;
  last_flight_at: number;
  flight_key: string | null;
}

export interface FlightRow {
  key: string;
  number: string;
  from_code: string;
  to_code: string;
  departs_at: number;
  lands_at: number;
}

export interface ConnRow {
  id: number;
  from_id: number;
  to_id: number;
  status: 'requested' | 'connected' | 'declined';
  flight_key: string;
}
