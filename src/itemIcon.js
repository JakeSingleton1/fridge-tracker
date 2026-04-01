/**
 * itemIcon.js
 *
 * Two-level emoji resolution:
 *   1. Scan the item name for known keywords (most-specific phrases first)
 *   2. Fall back to the item's category
 */

// ── Ordered from most-specific (multi-word) to least-specific (single word) ──
// Longer phrases must come before their component words so they win the match.
const KEYWORD_MAP = [
  // ── Multi-word phrases first ────────────────────────────────────────────
  ['chocolate milk',    '🥛'],
  ['whipping cream',    '🥛'],
  ['heavy cream',       '🥛'],
  ['sour cream',        '🥛'],
  ['ice cream',         '🍦'],
  ['hot sauce',         '🌶️'],
  ['ground turkey',     '🦃'],
  ['ground beef',       '🥩'],
  ['ground chicken',    '🍗'],
  ['cream cheese',      '🧀'],
  ['cottage cheese',    '🧀'],
  ['string cheese',     '🧀'],
  ['sliced ham',        '🥩'],
  ['sliced turkey',     '🥩'],
  ['sliced cheese',     '🧀'],
  ['hard boiled',       '🥚'],
  ['orange juice',      '🍊'],
  ['apple juice',       '🍎'],
  ['grape juice',       '🍇'],
  ['sparkling water',   '💧'],
  ['almond milk',       '🥛'],
  ['oat milk',          '🥛'],
  ['coconut milk',      '🥥'],

  // ── Single keywords ─────────────────────────────────────────────────────
  // Proteins
  ['turkey',            '🦃'],
  ['chicken',           '🍗'],
  ['beef',              '🥩'],
  ['steak',             '🥩'],
  ['pork',              '🥓'],
  ['bacon',             '🥓'],
  ['ham',               '🥩'],
  ['sausage',           '🌭'],
  ['salami',            '🥩'],
  ['pepperoni',         '🍕'],
  ['salmon',            '🐟'],
  ['tuna',              '🐟'],
  ['shrimp',            '🦐'],
  ['lobster',           '🦞'],
  ['crab',              '🦀'],
  ['fish',              '🐟'],
  ['egg',               '🥚'],
  ['eggs',              '🥚'],
  ['tofu',              '🫘'],
  ['tempeh',            '🫘'],

  // Dairy
  ['milk',              '🥛'],
  ['butter',            '🧈'],
  ['ghee',              '🧈'],
  ['cheese',            '🧀'],
  ['cheddar',           '🧀'],
  ['parmesan',          '🧀'],
  ['mozzarella',        '🧀'],
  ['brie',              '🧀'],
  ['gouda',             '🧀'],
  ['mascarpone',        '🧀'],
  ['ricotta',           '🧀'],
  ['feta',              '🧀'],
  ['gruyere',           '🧀'],
  ['colby',             '🧀'],
  ['provolone',         '🧀'],
  ['yogurt',            '🥛'],
  ['yoghurt',           '🥛'],
  ['kefir',             '🥛'],
  ['cream',             '🥛'],
  ['creamer',           '🥛'],

  // Produce – Fruits
  ['apple',             '🍎'],
  ['apples',            '🍎'],
  ['banana',            '🍌'],
  ['bananas',           '🍌'],
  ['orange',            '🍊'],
  ['oranges',           '🍊'],
  ['lemon',             '🍋'],
  ['lime',              '🍋'],
  ['strawberry',        '🍓'],
  ['strawberries',      '🍓'],
  ['blueberry',         '🫐'],
  ['blueberries',       '🫐'],
  ['blackberry',        '🫐'],
  ['blackberries',      '🫐'],
  ['raspberry',         '🍓'],
  ['raspberries',       '🍓'],
  ['grape',             '🍇'],
  ['grapes',            '🍇'],
  ['watermelon',        '🍉'],
  ['melon',             '🍈'],
  ['cantaloupe',        '🍈'],
  ['honeydew',          '🍈'],
  ['pineapple',         '🍍'],
  ['mango',             '🥭'],
  ['peach',             '🍑'],
  ['peaches',           '🍑'],
  ['pear',              '🍐'],
  ['cherry',            '🍒'],
  ['cherries',          '🍒'],
  ['kiwi',              '🥝'],
  ['avocado',           '🥑'],
  ['coconut',           '🥥'],
  ['pomegranate',       '🍎'],
  ['fig',               '🫐'],
  ['plum',              '🍑'],

  // Produce – Vegetables
  ['broccoli',          '🥦'],
  ['carrot',            '🥕'],
  ['carrots',           '🥕'],
  ['lettuce',           '🥬'],
  ['spinach',           '🥬'],
  ['kale',              '🥬'],
  ['arugula',           '🥬'],
  ['salad',             '🥗'],
  ['tomato',            '🍅'],
  ['tomatoes',          '🍅'],
  ['pepper',            '🫑'],
  ['jalapeño',          '🌶️'],
  ['jalapeno',          '🌶️'],
  ['onion',             '🧅'],
  ['scallion',          '🌱'],
  ['garlic',            '🧄'],
  ['potato',            '🥔'],
  ['potatoes',          '🥔'],
  ['sweet potato',      '🥔'],
  ['corn',              '🌽'],
  ['cucumber',          '🥒'],
  ['zucchini',          '🥒'],
  ['mushroom',          '🍄'],
  ['mushrooms',         '🍄'],
  ['celery',            '🥬'],
  ['asparagus',         '🥦'],
  ['cauliflower',       '🥦'],
  ['cabbage',           '🥬'],
  ['brussels',          '🥦'],
  ['beet',              '🫚'],
  ['radish',            '🌱'],
  ['artichoke',         '🥦'],
  ['eggplant',          '🍆'],
  ['herb',              '🌿'],
  ['basil',             '🌿'],
  ['cilantro',          '🌿'],
  ['parsley',           '🌿'],
  ['mint',              '🌿'],

  // Prepared / Sauces / Jars
  ['bolognese',         '🍝'],
  ['marinara',          '🍝'],
  ['pasta',             '🍝'],
  ['noodle',            '🍜'],
  ['ramen',             '🍜'],
  ['soup',              '🍲'],
  ['stew',              '🍲'],
  ['broth',             '🍲'],
  ['stock',             '🍲'],
  ['chili',             '🌶️'],
  ['pesto',             '🌿'],
  ['salsa',             '🍅'],
  ['hummus',            '🫘'],
  ['guacamole',         '🥑'],
  ['tzatziki',          '🥒'],
  ['curry',             '🍛'],
  ['rice',              '🍚'],
  ['burrito',           '🌯'],
  ['taco',              '🌮'],
  ['sandwich',          '🥪'],
  ['dip',               '🫙'],
  ['spread',            '🫙'],
  ['sauce',             '🫙'],

  // Beverages
  ['juice',             '🧃'],
  ['water',             '💧'],
  ['soda',              '🥤'],
  ['cola',              '🥤'],
  ['lemonade',          '🍋'],
  ['coffee',            '☕'],
  ['espresso',          '☕'],
  ['tea',               '🍵'],
  ['beer',              '🍺'],
  ['wine',              '🍷'],
  ['kombucha',          '🫙'],
  ['smoothie',          '🥤'],
  ['shake',             '🥛'],

  // Snacks / Sweets
  ['chocolate',         '🍫'],
  ['candy',             '🍬'],
  ['cookie',            '🍪'],
  ['cookies',           '🍪'],
  ['cake',              '🎂'],
  ['muffin',            '🧁'],
  ['cupcake',           '🧁'],
  ['brownie',           '🍫'],
  ['pie',               '🥧'],
  ['pudding',           '🍮'],
  ['jello',             '🍮'],
  ['chips',             '🥨'],
  ['crackers',          '🫙'],
  ['granola',           '🌾'],
  ['oatmeal',           '🌾'],
  ['cereal',            '🌾'],
  ['popcorn',           '🍿'],
  ['pretzel',           '🥨'],
  ['bar',               '🍫'],
  ['snickers',          '🍫'],
  ['kit kat',           '🍫'],
  ['m&m',               '🍬'],

  // Condiments
  ['ketchup',           '🍅'],
  ['mustard',           '🌭'],
  ['mayo',              '🫙'],
  ['mayonnaise',        '🫙'],
  ['ranch',             '🫙'],
  ['vinegar',           '🫙'],
  ['olive oil',         '🫙'],
  ['oil',               '🫙'],
  ['syrup',             '🍯'],
  ['honey',             '🍯'],
  ['jam',               '🫙'],
  ['jelly',             '🫙'],
  ['pickle',            '🥒'],
  ['pickles',           '🥒'],
  ['relish',            '🌭'],
  ['aioli',             '🫙'],
  ['tahini',            '🫙'],

  // Bread / Grains
  ['bread',             '🍞'],
  ['sourdough',         '🍞'],
  ['bagel',             '🥯'],
  ['croissant',         '🥐'],
  ['tortilla',          '🫓'],
  ['pita',              '🫓'],
  ['wrap',              '🌯'],
  ['roll',              '🍞'],
  ['bun',               '🍞'],
  ['english muffin',    '🥯'],

  // Leftover / Meal-prepped
  ['leftover',          '🍱'],
  ['leftovers',         '🍱'],
  ['meal prep',         '🍱'],
  ['pizza',             '🍕'],
];

// ── Category fallback ─────────────────────────────────────────────────────────
const CATEGORY_EMOJI = {
  Proteins:   '🥩',
  Produce:    '🥬',
  Dairy:      '🧀',
  Beverages:  '🥤',
  Condiments: '🫙',
  Leftovers:  '🍱',
  Snacks:     '🍿',
  Other:      '🍽️',
};

// ── Category keyword map (ordered most-specific first) ────────────────────────
const CATEGORY_MAP = [
  // Multi-word matches first
  ['chocolate milk',  'Dairy'],
  ['almond milk',     'Dairy'],
  ['oat milk',        'Dairy'],
  ['coconut milk',    'Dairy'],
  ['whipping cream',  'Dairy'],
  ['heavy cream',     'Dairy'],
  ['sour cream',      'Dairy'],
  ['cream cheese',    'Dairy'],
  ['ice cream',       'Snacks'],
  ['hot sauce',       'Condiments'],
  ['ground turkey',   'Proteins'],
  ['ground beef',     'Proteins'],
  ['ground chicken',  'Proteins'],
  ['sliced ham',      'Proteins'],
  ['sliced turkey',   'Proteins'],
  ['orange juice',    'Beverages'],
  ['apple juice',     'Beverages'],
  ['sparkling water', 'Beverages'],
  ['peanut butter',   'Condiments'],
  ['olive oil',       'Condiments'],
  ['meal prep',       'Leftovers'],
  // Proteins
  ['turkey',      'Proteins'], ['chicken',   'Proteins'], ['beef',      'Proteins'],
  ['steak',       'Proteins'], ['pork',      'Proteins'], ['bacon',     'Proteins'],
  ['ham',         'Proteins'], ['sausage',   'Proteins'], ['salmon',    'Proteins'],
  ['tuna',        'Proteins'], ['shrimp',    'Proteins'], ['fish',      'Proteins'],
  ['egg',         'Proteins'], ['eggs',      'Proteins'], ['tofu',      'Proteins'],
  ['tempeh',      'Proteins'], ['salami',    'Proteins'], ['pepperoni', 'Proteins'],
  ['lobster',     'Proteins'], ['crab',      'Proteins'],
  // Dairy
  ['milk',        'Dairy'],    ['butter',    'Dairy'],    ['ghee',      'Dairy'],
  ['cheese',      'Dairy'],    ['cheddar',   'Dairy'],    ['parmesan',  'Dairy'],
  ['mozzarella',  'Dairy'],    ['brie',      'Dairy'],    ['gouda',     'Dairy'],
  ['mascarpone',  'Dairy'],    ['ricotta',   'Dairy'],    ['feta',      'Dairy'],
  ['colby',       'Dairy'],    ['provolone', 'Dairy'],    ['yogurt',    'Dairy'],
  ['yoghurt',     'Dairy'],    ['kefir',     'Dairy'],    ['cream',     'Dairy'],
  ['creamer',     'Dairy'],    ['whey',      'Dairy'],
  // Produce - fruits
  ['apple',       'Produce'],  ['banana',    'Produce'],  ['orange',    'Produce'],
  ['lemon',       'Produce'],  ['lime',      'Produce'],  ['berry',     'Produce'],
  ['berries',     'Produce'],  ['grape',     'Produce'],  ['grapes',    'Produce'],
  ['watermelon',  'Produce'],  ['melon',     'Produce'],  ['pineapple', 'Produce'],
  ['mango',       'Produce'],  ['peach',     'Produce'],  ['pear',      'Produce'],
  ['cherry',      'Produce'],  ['kiwi',      'Produce'],  ['avocado',   'Produce'],
  ['coconut',     'Produce'],  ['fig',       'Produce'],  ['plum',      'Produce'],
  // Produce - vegetables
  ['broccoli',    'Produce'],  ['carrot',    'Produce'],  ['lettuce',   'Produce'],
  ['spinach',     'Produce'],  ['kale',      'Produce'],  ['arugula',   'Produce'],
  ['salad',       'Produce'],  ['tomato',    'Produce'],  ['tomatoes',  'Produce'],
  ['pepper',      'Produce'],  ['jalapeño',  'Produce'],  ['jalapeno',  'Produce'],
  ['onion',       'Produce'],  ['garlic',    'Produce'],  ['potato',    'Produce'],
  ['corn',        'Produce'],  ['cucumber',  'Produce'],  ['zucchini',  'Produce'],
  ['mushroom',    'Produce'],  ['celery',    'Produce'],  ['asparagus', 'Produce'],
  ['cauliflower', 'Produce'],  ['cabbage',   'Produce'],  ['eggplant',  'Produce'],
  ['herb',        'Produce'],  ['basil',     'Produce'],  ['cilantro',  'Produce'],
  // Beverages
  ['juice',       'Beverages'], ['water',    'Beverages'], ['soda',     'Beverages'],
  ['cola',        'Beverages'], ['lemonade', 'Beverages'], ['coffee',   'Beverages'],
  ['espresso',    'Beverages'], ['tea',      'Beverages'], ['beer',     'Beverages'],
  ['wine',        'Beverages'], ['kombucha', 'Beverages'], ['smoothie', 'Beverages'],
  ['drink',       'Beverages'],
  // Condiments / Pantry sauces
  ['ketchup',     'Condiments'], ['mustard',  'Condiments'], ['mayo',      'Condiments'],
  ['mayonnaise',  'Condiments'], ['ranch',    'Condiments'], ['vinegar',   'Condiments'],
  ['oil',         'Condiments'], ['syrup',    'Condiments'], ['honey',     'Condiments'],
  ['jam',         'Condiments'], ['jelly',    'Condiments'], ['pickle',    'Condiments'],
  ['relish',      'Condiments'], ['aioli',    'Condiments'], ['tahini',    'Condiments'],
  ['pesto',       'Condiments'], ['salsa',    'Condiments'], ['sauce',     'Condiments'],
  ['dressing',    'Condiments'], ['hummus',   'Condiments'], ['guacamole', 'Condiments'],
  // Snacks / Sweets
  ['chocolate',   'Snacks'], ['candy',    'Snacks'], ['cookie',   'Snacks'],
  ['cake',        'Snacks'], ['muffin',   'Snacks'], ['brownie',  'Snacks'],
  ['pie',         'Snacks'], ['chips',    'Snacks'], ['crackers', 'Snacks'],
  ['granola',     'Snacks'], ['popcorn',  'Snacks'], ['pretzel',  'Snacks'],
  ['bar',         'Snacks'], ['snickers', 'Snacks'], ['cereal',   'Snacks'],
  // Leftovers
  ['leftover',   'Leftovers'], ['leftovers', 'Leftovers'], ['pizza', 'Leftovers'],
];

// ── Location keyword map ──────────────────────────────────────────────────────
// Checked in order; first match wins. Falls back to 'Fridge'.
const FREEZER_KEYWORDS = [
  'frozen', 'freeze', 'ice cream', 'popsicle', 'frost',
  'frozen meal', 'frozen pizza', 'frozen burrito',
];
const PANTRY_KEYWORDS = [
  'canned', 'dried', 'dry pasta', 'dry noodle', 'instant',
  'cereal', 'oatmeal', 'granola', 'crackers', 'chips', 'popcorn', 'pretzels',
  'rice', 'flour', 'sugar', 'salt', 'spice', 'seasoning',
  'oil', 'olive oil', 'vinegar',
  'honey', 'syrup', 'jam', 'jelly', 'peanut butter', 'nut butter',
  'coffee', 'tea', 'cocoa',
  'bread', 'bagel', 'tortilla', 'pita', 'crouton',
  'nuts', 'almonds', 'walnuts', 'cashews', 'peanuts',
  'beans', 'lentils', 'chickpeas',
  'soup can', 'canned soup', 'canned beans', 'canned tomato',
  'pasta sauce', 'bolognese', 'marinara',
  'hot sauce', 'ketchup', 'mustard', 'soy sauce', 'worcestershire',
  'protein bar', 'energy bar', 'granola bar',
];

/**
 * Returns the best emoji for an item given its name and optional category.
 */
export function getItemEmoji(name = '', category = '') {
  const lower = name.toLowerCase();
  for (const [keyword, emoji] of KEYWORD_MAP) {
    if (lower.includes(keyword)) return emoji;
  }
  return CATEGORY_EMOJI[category] ?? '🍽️';
}

/**
 * Infers the category from an item name.
 * @param {string} name
 * @returns {string} category label
 */
export function getItemCategory(name = '') {
  const lower = name.toLowerCase();
  for (const [keyword, cat] of CATEGORY_MAP) {
    if (lower.includes(keyword)) return cat;
  }
  return 'Other';
}

/**
 * Infers the best storage location from an item name and category.
 * @param {string} name
 * @param {string} [category]
 * @returns {'Fridge'|'Freezer'|'Pantry'}
 */
export function getDefaultLocation(name = '', category = '') {
  const lower = name.toLowerCase();
  for (const kw of FREEZER_KEYWORDS) {
    if (lower.includes(kw)) return 'Freezer';
  }
  for (const kw of PANTRY_KEYWORDS) {
    if (lower.includes(kw)) return 'Pantry';
  }
  // Beverages are often pantry-stable until opened; Condiments too
  if (category === 'Condiments') return 'Pantry';
  if (category === 'Snacks')     return 'Pantry';
  return 'Fridge';
}
