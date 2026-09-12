// ── Cold-start merchant map ─────────────────────────────────────────────────
//
// Only needed before there is any history to learn from - learnLedger wins
// over this the moment you have filed the same merchant once. Deliberately
// short, and Philippines-first, because a long list of American chains would
// be dead weight.
export const SEED_MERCHANTS = {
  food: ['jollibee', 'mcdo', 'mcdonalds', 'kfc', 'chowking', 'greenwich',
         'mang inasal', 'bonchon', 'starbucks', 'dunkin', 'tapsi', 'carinderia',
         'lunch', 'dinner', 'breakfast', 'merienda', 'ulam', 'kain', 'coffee'],
  groceries: ['sm supermarket', 'puregold', 'landers', 'smarket', 'savemore',
              'robinsons supermarket', 'waltermart', 'grocery', 'palengke',
              'sari sari', 'sari-sari'],
  transpo: ['grab', 'angkas', 'joyride', 'jeep', 'jeepney', 'mrt', 'lrt', 'bus',
            'tricycle', 'trike', 'taxi', 'toll', 'parking', 'gas', 'gasoline',
            'shell', 'petron', 'caltex'],
  shopping: ['shopee', 'lazada', 'tiktok shop', 'uniqlo', 'sm store', 'zalora',
             'divisoria', 'temu'],
  bills: ['meralco', 'maynilad', 'manila water', 'globe', 'smart', 'pldt',
          'converge', 'sky', 'dito', 'rent', 'kuryente', 'tubig', 'internet',
          'load', 'electricity', 'water'],
  entertainment: ['netflix', 'spotify', 'youtube', 'disney', 'viu', 'cinema',
                  'steam', 'hbo', 'prime video'],
  health: ['mercury drug', 'watsons', 'generika', 'rose pharmacy', 'pharmacy',
           'clinic', 'hospital', 'gamot', 'medicine', 'dentist'],
}

export const INFLOW_WORDS = [
  'salary', 'sahod', 'payday', 'paid me', 'received', 'refund', 'rebate',
  'bonus', 'commission', 'allowance', 'dividend', 'interest', 'cashback',
  'reimbursed', 'sold', 'income',
]

/**
 * Words that can never identify a merchant, so they must never become a rule.
 *
 * Kept deliberately SHORT. The first version of the learner had no list at
 * all and indexed every word of every description, which against a real
 * 25-row ledger produced "with" -> Food (from "Lunch with team") and fired on
 * "800 with mom". The instinct is then to grow this list until the noise
 * stops - but most of the noise was never stopwords. It was ordinary words
 * like "run" and "team" that happened to appear once.
 *
 * So the evidence bar below does the heavy lifting, and this list only holds
 * words that carry no signal even when they appear a hundred times.
 */
export const STOPWORDS = new Set([
  // English function words
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'at', 'in', 'on', 'to', 'from',
  'with', 'by', 'per', 'via', 'into', 'onto', 'off', 'out', 'up', 'as',
  'is', 'was', 'be', 'my', 'me', 'mine', 'our', 'we', 'us', 'his', 'her',
  'their', 'them', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'they',
  // Tagalog and Taglish function words
  'sa', 'ng', 'nga', 'na', 'po', 'ko', 'ka', 'ako', 'siya', 'kami', 'tayo',
  'yung', 'ung', 'mga', 'kay', 'para', 'yan', 'ito', 'din', 'rin', 'lang',
  'naman', 'daw', 'raw',
  // the verbs quick log strips from a description anyway, so they carry none
  'paid', 'pay', 'payment', 'spent', 'spend', 'bought', 'buy', 'purchase',
  'purchased', 'transfer', 'transferred', 'sent', 'send', 'received',
  'receive', 'charge', 'charged',
  // dates, consumed by the date reader before this ever sees them
  'today', 'yesterday', 'kahapon', 'ngayon',
])
