/**
 * The pre-book meal menu. This is a sample menu with sample prices (in Malaysian ringgit) so the feature can be shown
 * end to end; in the live version the menu, prices and cut-off time come from AirAsia's catalogue and the choice is
 * saved to the booking. Shared by the server (to check a choice) and the page (to draw the menu).
 */
export interface Meal {
  id: string;
  name: string;
  text: string;
  /** Sample price in MYR. */
  price: number;
  tags: string[];
}

export const MEALS: readonly Meal[] = [
  { id: 'nasi-lemak', name: 'Nasi lemak with chicken rendang', text: 'Coconut rice, spicy chicken rendang, anchovies, peanuts, cucumber and sambal.', price: 17, tags: ['Halal', 'Spicy'] },
  { id: 'chicken-rice', name: 'Hainanese-style chicken rice', text: 'Poached chicken on fragrant rice with chilli sauce and a clear soup.', price: 16, tags: ['Halal'] },
  { id: 'veg-curry', name: 'Vegetable curry with rice', text: 'Mild potato, chickpea and cauliflower curry on steamed rice.', price: 15, tags: ['Vegetarian', 'Vegan', 'Halal'] },
  { id: 'mee-goreng', name: 'Mee goreng', text: 'Wok-fried yellow noodles with egg, vegetables and a little chilli.', price: 15, tags: ['Halal', 'Spicy'] },
  { id: 'pasta', name: 'Chicken bolognese pasta', text: 'Penne in a tomato and chicken ragu.', price: 18, tags: ['Halal'] },
  { id: 'grill-gf', name: 'Grilled chicken, rice and salad', text: 'Plain grilled chicken breast, steamed rice and a green salad.', price: 18, tags: ['Gluten-free', 'Halal'] },
  { id: 'kids', name: 'Kids meal', text: 'Chicken nuggets, rice, fruit and a juice box.', price: 12, tags: ['Halal', 'For children'] },
  { id: 'fruit-box', name: 'Fruit and nut box', text: 'Fresh fruit, mixed nuts and a hummus dip. A light bite.', price: 11, tags: ['Vegetarian', 'Vegan', 'Gluten-free'] },
];

export const mealById = (id: unknown): Meal | undefined => MEALS.find((m) => m.id === id);

/** Pre-booking closes this long before departure (sample rule). */
export const MEAL_CLOSES_BEFORE_MS = 4 * 3600 * 1000;
