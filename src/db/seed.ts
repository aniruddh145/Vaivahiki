/* eslint-disable */
// Seeds languages, a community, the full biodata field set (English + Hindi),
// credit packages, report reasons and the first admin account.
// Safe to run more than once – existing rows are left alone.
//   npm run db:seed              → base data + admin
//   SEED_DEMO=1 npm run db:seed  → also 16 demo profiles for testing
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, t } from "./index";
import type { FieldOption } from "./schema";

type O = [string, string, string];
const opts = (list: O[]): FieldOption[] => list.map(([value, en, hi]) => ({ value, label: { en, hi } }));
const yesNoOpts = opts([["no", "No", "नहीं"], ["occasionally", "Occasionally", "कभी-कभी"], ["yes", "Yes", "हाँ"]]);

const SECTIONS = [
  { key: "personal", label: { en: "Personal details", hi: "व्यक्तिगत विवरण" } },
  { key: "horoscope", label: { en: "Horoscope details", hi: "कुंडली विवरण" } },
  { key: "career", label: { en: "Education & career", hi: "शिक्षा और व्यवसाय" } },
  { key: "family", label: { en: "Family details", hi: "पारिवारिक विवरण" } },
  { key: "partner", label: { en: "Partner preferences", hi: "जीवनसाथी से अपेक्षाएँ" } },
  { key: "about", label: { en: "About", hi: "परिचय" } },
];

type F = {
  key: string; section: string; type: string; en: string; hi: string;
  options?: FieldOption[]; required?: boolean; visibility?: string; filterable?: boolean; card?: boolean;
  min?: number; max?: number; phEn?: string; phHi?: string;
};

const STATES: O[] = [
  ["rajasthan", "Rajasthan", "राजस्थान"], ["gujarat", "Gujarat", "गुजरात"], ["madhya_pradesh", "Madhya Pradesh", "मध्य प्रदेश"],
  ["maharashtra", "Maharashtra", "महाराष्ट्र"], ["delhi_ncr", "Delhi NCR", "दिल्ली एनसीआर"], ["uttar_pradesh", "Uttar Pradesh", "उत्तर प्रदेश"],
  ["haryana", "Haryana", "हरियाणा"], ["karnataka", "Karnataka", "कर्नाटक"], ["telangana", "Telangana", "तेलंगाना"],
  ["tamil_nadu", "Tamil Nadu", "तमिलनाडु"], ["west_bengal", "West Bengal", "पश्चिम बंगाल"], ["other_india", "Other state", "अन्य राज्य"],
  ["abroad", "Abroad", "विदेश"],
];
const MARITAL: O[] = [
  ["never_married", "Never married", "अविवाहित"], ["divorced", "Divorced", "तलाकशुदा"], ["widowed", "Widowed", "विधुर / विधवा"],
  ["awaiting_divorce", "Awaiting divorce", "तलाक प्रक्रिया में"],
];

const FIELDS: F[] = [
  // Personal
  { key: "profile_created_by", section: "personal", type: "SELECT", en: "Profile created by", hi: "प्रोफ़ाइल किसने बनाई", visibility: "MEMBERS",
    options: opts([["self", "Self", "स्वयं"], ["parent", "Parent", "माता-पिता"], ["sibling", "Brother / Sister", "भाई / बहन"], ["relative", "Relative", "रिश्तेदार"], ["friend", "Friend", "मित्र"]]) },
  { key: "marital_status", section: "personal", type: "SELECT", en: "Marital status", hi: "वैवाहिक स्थिति", required: true, visibility: "PUBLIC", filterable: true, card: true, options: opts(MARITAL) },
  { key: "height", section: "personal", type: "HEIGHT", en: "Height", hi: "ऊँचाई", required: true, visibility: "PUBLIC", filterable: true, card: true },
  { key: "weight", section: "personal", type: "NUMBER", en: "Weight (kg)", hi: "वज़न (किलो)", min: 30, max: 200 },
  { key: "complexion", section: "personal", type: "SELECT", en: "Complexion", hi: "रंग", filterable: true,
    options: opts([["very_fair", "Very fair", "बहुत गोरा"], ["fair", "Fair", "गोरा"], ["wheatish", "Wheatish", "गेहुँआ"], ["wheatish_dark", "Wheatish brown", "सांवला"], ["dark", "Dark", "श्याम"]]) },
  { key: "body_type", section: "personal", type: "SELECT", en: "Body type", hi: "शारीरिक बनावट",
    options: opts([["slim", "Slim", "पतला"], ["average", "Average", "सामान्य"], ["athletic", "Athletic", "सुडौल"], ["heavy", "Heavy", "भारी"]]) },
  { key: "blood_group", section: "personal", type: "SELECT", en: "Blood group", hi: "ब्लड ग्रुप",
    options: opts(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => [b, b, b] as O)) },
  { key: "mother_tongue", section: "personal", type: "SELECT", en: "Mother tongue", hi: "मातृभाषा", filterable: true,
    options: opts([["hindi", "Hindi", "हिंदी"], ["mewari", "Mewari", "मेवाड़ी"], ["marwari", "Marwari", "मारवाड़ी"], ["rajasthani", "Rajasthani", "राजस्थानी"], ["malvi", "Malvi", "मालवी"], ["gujarati", "Gujarati", "गुजराती"], ["marathi", "Marathi", "मराठी"], ["other", "Other", "अन्य"]]) },
  { key: "diet", section: "personal", type: "SELECT", en: "Diet", hi: "आहार", filterable: true, card: false,
    options: opts([["veg", "Vegetarian", "शाकाहारी"], ["eggetarian", "Eggetarian", "अंडा खाते हैं"], ["nonveg", "Non-vegetarian", "मांसाहारी"], ["jain", "Jain food", "जैन भोजन"]]) },
  { key: "smoking", section: "personal", type: "SELECT", en: "Smoking", hi: "धूम्रपान", options: yesNoOpts },
  { key: "drinking", section: "personal", type: "SELECT", en: "Drinking", hi: "मद्यपान", options: yesNoOpts },
  { key: "spectacles", section: "personal", type: "BOOLEAN", en: "Wears spectacles", hi: "चश्मा लगाते हैं" },
  { key: "disability", section: "personal", type: "SELECT", en: "Physical disability", hi: "शारीरिक अक्षमता",
    options: opts([["none", "None", "कोई नहीं"], ["physical", "Physical disability", "शारीरिक अक्षमता"], ["other", "Other (see about)", "अन्य (परिचय देखें)"]]) },

  // Horoscope
  { key: "birth_time", section: "horoscope", type: "TIME", en: "Birth time", hi: "जन्म समय" },
  { key: "birth_place", section: "horoscope", type: "TEXT", en: "Birth place", hi: "जन्म स्थान" },
  { key: "gotra", section: "horoscope", type: "TEXT", en: "Gotra", hi: "गोत्र", required: true, card: true, filterable: true },
  { key: "maternal_gotra", section: "horoscope", type: "TEXT", en: "Maternal (Nanihal) gotra", hi: "ननिहाल का गोत्र" },
  { key: "rashi", section: "horoscope", type: "SELECT", en: "Rashi (moon sign)", hi: "राशि", filterable: true,
    options: opts([["mesh", "Mesh (Aries)", "मेष"], ["vrishabh", "Vrishabh (Taurus)", "वृषभ"], ["mithun", "Mithun (Gemini)", "मिथुन"], ["kark", "Kark (Cancer)", "कर्क"], ["singh", "Singh (Leo)", "सिंह"], ["kanya", "Kanya (Virgo)", "कन्या"], ["tula", "Tula (Libra)", "तुला"], ["vrishchik", "Vrishchik (Scorpio)", "वृश्चिक"], ["dhanu", "Dhanu (Sagittarius)", "धनु"], ["makar", "Makar (Capricorn)", "मकर"], ["kumbh", "Kumbh (Aquarius)", "कुंभ"], ["meen", "Meen (Pisces)", "मीन"]]) },
  { key: "nakshatra", section: "horoscope", type: "SELECT", en: "Nakshatra", hi: "नक्षत्र",
    options: opts([["ashwini", "Ashwini", "अश्विनी"], ["bharani", "Bharani", "भरणी"], ["krittika", "Krittika", "कृत्तिका"], ["rohini", "Rohini", "रोहिणी"], ["mrigashira", "Mrigashira", "मृगशिरा"], ["ardra", "Ardra", "आर्द्रा"], ["punarvasu", "Punarvasu", "पुनर्वसु"], ["pushya", "Pushya", "पुष्य"], ["ashlesha", "Ashlesha", "आश्लेषा"], ["magha", "Magha", "मघा"], ["purva_phalguni", "Purva Phalguni", "पूर्वा फाल्गुनी"], ["uttara_phalguni", "Uttara Phalguni", "उत्तरा फाल्गुनी"], ["hasta", "Hasta", "हस्त"], ["chitra", "Chitra", "चित्रा"], ["swati", "Swati", "स्वाति"], ["vishakha", "Vishakha", "विशाखा"], ["anuradha", "Anuradha", "अनुराधा"], ["jyeshtha", "Jyeshtha", "ज्येष्ठा"], ["mula", "Mula", "मूल"], ["purva_ashadha", "Purva Ashadha", "पूर्वाषाढ़ा"], ["uttara_ashadha", "Uttara Ashadha", "उत्तराषाढ़ा"], ["shravana", "Shravana", "श्रवण"], ["dhanishta", "Dhanishta", "धनिष्ठा"], ["shatabhisha", "Shatabhisha", "शतभिषा"], ["purva_bhadrapada", "Purva Bhadrapada", "पूर्वा भाद्रपद"], ["uttara_bhadrapada", "Uttara Bhadrapada", "उत्तरा भाद्रपद"], ["revati", "Revati", "रेवती"]]) },
  { key: "manglik", section: "horoscope", type: "SELECT", en: "Manglik", hi: "मांगलिक", filterable: true, card: true, visibility: "PUBLIC",
    options: opts([["no", "No", "नहीं"], ["yes", "Yes", "हाँ"], ["partial", "Anshik (partial)", "आंशिक"], ["dont_know", "Don't know", "पता नहीं"]]) },
  { key: "gan", section: "horoscope", type: "SELECT", en: "Gan", hi: "गण", options: opts([["dev", "Dev", "देव"], ["manushya", "Manushya", "मनुष्य"], ["rakshas", "Rakshas", "राक्षस"]]) },
  { key: "nadi", section: "horoscope", type: "SELECT", en: "Nadi", hi: "नाड़ी", options: opts([["aadi", "Aadi", "आदि"], ["madhya", "Madhya", "मध्य"], ["antya", "Antya", "अंत्य"]]) },
  { key: "horoscope_match", section: "horoscope", type: "SELECT", en: "Horoscope matching", hi: "कुंडली मिलान",
    options: opts([["required", "Required", "आवश्यक"], ["not_required", "Not required", "आवश्यक नहीं"]]) },

  // Career
  { key: "education_level", section: "career", type: "SELECT", en: "Highest education", hi: "उच्चतम शिक्षा", required: true, visibility: "PUBLIC", filterable: true, card: true,
    options: opts([["below_10", "Below 10th", "10वीं से कम"], ["10th", "10th", "10वीं"], ["12th", "12th", "12वीं"], ["diploma", "Diploma / ITI", "डिप्लोमा / आईटीआई"], ["graduate", "Graduate", "स्नातक"], ["post_graduate", "Post graduate", "स्नातकोत्तर"], ["professional", "Professional (CA / CS / MBBS / LLB)", "प्रोफेशनल (सीए / सीएस / एमबीबीएस / एलएलबी)"], ["doctorate", "Doctorate (PhD)", "पीएचडी"]]) },
  { key: "education_detail", section: "career", type: "TEXT", en: "Education details", hi: "शिक्षा का विवरण", visibility: "PUBLIC", phEn: "e.g. B.Tech (CSE), MBA", phHi: "जैसे बी.टेक, एमबीए" },
  { key: "occupation_type", section: "career", type: "SELECT", en: "Employed in", hi: "कार्यक्षेत्र", visibility: "PUBLIC", filterable: true, card: true,
    options: opts([["private_job", "Private job", "प्राइवेट नौकरी"], ["government_job", "Government job", "सरकारी नौकरी"], ["business", "Business", "व्यवसाय"], ["professional", "Self-employed professional", "स्व-रोज़गार प्रोफेशनल"], ["defence", "Defence", "सेना / रक्षा"], ["priest", "Karmakand / Priest", "कर्मकांड / पुरोहित"], ["studying", "Studying", "पढ़ाई कर रहे हैं"], ["not_working", "Not working", "कार्यरत नहीं"], ["homemaker", "Homemaker", "गृहिणी"]]) },
  { key: "occupation", section: "career", type: "TEXT", en: "Designation / work", hi: "पद / कार्य", phEn: "e.g. Software Engineer", phHi: "जैसे सॉफ़्टवेयर इंजीनियर" },
  { key: "employer", section: "career", type: "TEXT", en: "Company / organisation", hi: "कंपनी / संस्था" },
  { key: "annual_income", section: "career", type: "SELECT", en: "Annual income", hi: "वार्षिक आय", filterable: true,
    options: opts([["none", "No income", "कोई आय नहीं"], ["upto_3l", "Up to ₹3 lakh", "₹3 लाख तक"], ["3_5l", "₹3 – 5 lakh", "₹3 – 5 लाख"], ["5_10l", "₹5 – 10 lakh", "₹5 – 10 लाख"], ["10_15l", "₹10 – 15 lakh", "₹10 – 15 लाख"], ["15_25l", "₹15 – 25 lakh", "₹15 – 25 लाख"], ["25_50l", "₹25 – 50 lakh", "₹25 – 50 लाख"], ["50l_1cr", "₹50 lakh – 1 crore", "₹50 लाख – 1 करोड़"], ["above_1cr", "Above ₹1 crore", "₹1 करोड़ से अधिक"]]) },
  { key: "work_city", section: "career", type: "TEXT", en: "Work location (city)", hi: "कार्य स्थान (शहर)", card: true, filterable: true },

  // Family
  { key: "father_name", section: "family", type: "TEXT", en: "Father's name", hi: "पिता का नाम", required: true },
  { key: "father_occupation", section: "family", type: "TEXT", en: "Father's occupation", hi: "पिता का व्यवसाय" },
  { key: "mother_name", section: "family", type: "TEXT", en: "Mother's name", hi: "माता का नाम" },
  { key: "mother_occupation", section: "family", type: "TEXT", en: "Mother's occupation", hi: "माता का व्यवसाय" },
  { key: "grandfather_name", section: "family", type: "TEXT", en: "Grandfather's name", hi: "दादाजी का नाम" },
  { key: "maternal_family", section: "family", type: "TEXT", en: "Maternal uncle (Mama) – name & place", hi: "मामाजी का नाम व स्थान" },
  { key: "brothers", section: "family", type: "NUMBER", en: "Brothers", hi: "भाई", min: 0, max: 15 },
  { key: "brothers_married", section: "family", type: "NUMBER", en: "Brothers married", hi: "विवाहित भाई", min: 0, max: 15 },
  { key: "sisters", section: "family", type: "NUMBER", en: "Sisters", hi: "बहनें", min: 0, max: 15 },
  { key: "sisters_married", section: "family", type: "NUMBER", en: "Sisters married", hi: "विवाहित बहनें", min: 0, max: 15 },
  { key: "family_type", section: "family", type: "SELECT", en: "Family type", hi: "परिवार का प्रकार", filterable: true,
    options: opts([["joint", "Joint family", "संयुक्त परिवार"], ["nuclear", "Nuclear family", "एकल परिवार"]]) },
  { key: "family_status", section: "family", type: "SELECT", en: "Family status", hi: "पारिवारिक स्थिति",
    options: opts([["middle", "Middle class", "मध्यम वर्ग"], ["upper_middle", "Upper middle class", "उच्च मध्यम वर्ग"], ["rich", "Rich", "संपन्न"], ["affluent", "Affluent", "अति संपन्न"]]) },
  { key: "family_values", section: "family", type: "SELECT", en: "Family values", hi: "पारिवारिक मूल्य",
    options: opts([["orthodox", "Orthodox", "रूढ़िवादी"], ["traditional", "Traditional", "पारंपरिक"], ["moderate", "Moderate", "मध्यम"], ["liberal", "Liberal", "उदार"]]) },
  { key: "house", section: "family", type: "SELECT", en: "Residence", hi: "निवास",
    options: opts([["own", "Own house", "अपना मकान"], ["rented", "Rented", "किराये का"], ["company", "Company provided", "कंपनी द्वारा"]]) },
  { key: "native_place", section: "family", type: "TEXT", en: "Native place", hi: "मूल निवास", card: true, filterable: true },
  { key: "current_city", section: "family", type: "TEXT", en: "Current city", hi: "वर्तमान शहर", required: true, visibility: "PUBLIC", card: true, filterable: true },
  { key: "current_state", section: "family", type: "SELECT", en: "State / country", hi: "राज्य / देश", visibility: "PUBLIC", filterable: true, options: opts(STATES) },
  { key: "address", section: "family", type: "TEXTAREA", en: "Full address", hi: "पूरा पता", visibility: "PREMIUM" },

  // Partner preferences
  { key: "pref_age_min", section: "partner", type: "NUMBER", en: "Preferred age – from", hi: "अपेक्षित आयु – से", min: 18, max: 70 },
  { key: "pref_age_max", section: "partner", type: "NUMBER", en: "Preferred age – to", hi: "अपेक्षित आयु – तक", min: 18, max: 70 },
  { key: "pref_height_min", section: "partner", type: "HEIGHT", en: "Minimum height", hi: "न्यूनतम ऊँचाई" },
  { key: "pref_marital_status", section: "partner", type: "MULTISELECT", en: "Acceptable marital status", hi: "स्वीकार्य वैवाहिक स्थिति", options: opts(MARITAL) },
  { key: "pref_manglik", section: "partner", type: "SELECT", en: "Manglik preference", hi: "मांगलिक अपेक्षा",
    options: opts([["must", "Must be manglik", "मांगलिक ही"], ["not", "Non-manglik only", "केवल अमांगलिक"], ["any", "Doesn't matter", "कोई फ़र्क नहीं"]]) },
  { key: "pref_education", section: "partner", type: "TEXT", en: "Preferred education", hi: "अपेक्षित शिक्षा" },
  { key: "pref_occupation", section: "partner", type: "TEXT", en: "Preferred occupation", hi: "अपेक्षित व्यवसाय" },
  { key: "pref_location", section: "partner", type: "TEXT", en: "Preferred location", hi: "अपेक्षित स्थान" },
  { key: "pref_expectations", section: "partner", type: "TEXTAREA", en: "Other expectations", hi: "अन्य अपेक्षाएँ" },

  // About
  { key: "about_me", section: "about", type: "TEXTAREA", en: "About me", hi: "मेरे बारे में", visibility: "PUBLIC" },
  { key: "hobbies", section: "about", type: "TEXT", en: "Hobbies & interests", hi: "रुचियाँ और शौक" },
  { key: "languages_known", section: "about", type: "MULTISELECT", en: "Languages known", hi: "ज्ञात भाषाएँ",
    options: opts([["hindi", "Hindi", "हिंदी"], ["english", "English", "अंग्रेज़ी"], ["sanskrit", "Sanskrit", "संस्कृत"], ["rajasthani", "Rajasthani", "राजस्थानी"], ["gujarati", "Gujarati", "गुजराती"], ["marathi", "Marathi", "मराठी"], ["other", "Other", "अन्य"]]) },
];

const REASONS: O[] = [
  ["fake_profile", "Fake profile", "नकली प्रोफ़ाइल"],
  ["wrong_info", "Wrong information", "गलत जानकारी"],
  ["already_married", "Already married / engaged", "पहले से विवाहित / सगाई हो चुकी"],
  ["misbehaviour", "Bad behaviour", "दुर्व्यवहार"],
  ["asking_money", "Asking for money", "पैसे माँगना"],
  ["spam", "Spam / promotion", "स्पैम / प्रचार"],
  ["photo_misuse", "Photo is not of this person", "फ़ोटो इस व्यक्ति की नहीं है"],
  ["other", "Other", "अन्य"],
];

async function main() {
  // Base data is created only once, so fields/packages the admin deletes later are not re-created on restart
  const [done] = await db.select().from(t.settings).where(eq(t.settings.key, "system.seeded"));
  if (!done) await base();
  await admin();
  if (process.env.SEED_DEMO === "1") await demo();
  console.log("Seed complete");
  process.exit(0);
}

async function base() {
  // Languages
  await db.insert(t.languages).values([
    { code: "en", name: "English", nativeName: "English", isDefault: false, order: 1 },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", isDefault: true, order: 0 },
  ]).onConflictDoNothing();

  // Communities
  await db.insert(t.communities).values([
    { slug: "dashora-nagar-brahman", name: { en: "Dashora Nagar Brahman", hi: "दशोरा नागर ब्राह्मण" }, codePrefix: "DNB", order: 0, active: true },
    { slug: "sindhi", name: { en: "Sindhi", hi: "सिंधी" }, codePrefix: "SIN", order: 1, active: false },
    { slug: "rajput", name: { en: "Rajput", hi: "राजपूत" }, codePrefix: "RAJ", order: 2, active: false },
    { slug: "brahman", name: { en: "Brahman (other)", hi: "ब्राह्मण (अन्य)" }, codePrefix: "BRH", order: 3, active: false },
  ]).onConflictDoNothing();

  // Sections + fields
  for (const [i, s] of SECTIONS.entries()) {
    await db.insert(t.fieldSections).values({ key: s.key, label: s.label, order: i }).onConflictDoNothing();
  }
  const secs = await db.select().from(t.fieldSections);
  const secId = Object.fromEntries(secs.map((s) => [s.key, s.id]));
  for (const [i, f] of FIELDS.entries()) {
    await db.insert(t.fieldDefinitions).values({
      key: f.key, sectionId: secId[f.section], type: f.type,
      label: { en: f.en, hi: f.hi },
      placeholder: f.phEn ? { en: f.phEn, hi: f.phHi ?? f.phEn } : null,
      options: f.options ?? null,
      required: !!f.required, visibility: f.visibility ?? "MEMBERS",
      filterable: !!f.filterable, showInCard: !!f.card,
      min: f.min ?? null, max: f.max ?? null, order: i,
    }).onConflictDoNothing();
  }

  // Report reasons
  for (const [i, [key, en, hi]] of REASONS.entries()) {
    await db.insert(t.reportReasons).values({ key, label: { en, hi }, order: i }).onConflictDoNothing();
  }

  // Credit packages
  const existingPk = await db.select().from(t.creditPackages);
  if (existingPk.length === 0) {
    await db.insert(t.creditPackages).values([
      { name: { en: "Starter", hi: "स्टार्टर" }, description: { en: "View contacts of 5 profiles", hi: "5 प्रोफ़ाइल के संपर्क देखें" }, credits: 5, pricePaise: 50000, order: 0 },
      { name: { en: "Family", hi: "फ़ैमिली" }, description: { en: "View contacts of 12 profiles", hi: "12 प्रोफ़ाइल के संपर्क देखें" }, credits: 12, pricePaise: 100000, highlight: true, order: 1 },
      { name: { en: "Premium", hi: "प्रीमियम" }, description: { en: "View contacts of 30 profiles", hi: "30 प्रोफ़ाइल के संपर्क देखें" }, credits: 30, pricePaise: 200000, order: 2 },
    ]);
  }

  await db.insert(t.settings).values({ key: "system.seeded", value: true }).onConflictDoNothing();
}

async function admin() {
  const adminMobile = process.env.ADMIN_MOBILE || "+919999999999";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";
  const [exists] = await db.select().from(t.users).where(eq(t.users.mobile, adminMobile));
  if (!exists) {
    await db.insert(t.users).values({
      name: "Samaj Admin", mobile: adminMobile, email: process.env.ADMIN_EMAIL || null,
      passwordHash: await bcrypt.hash(adminPass, 10), role: "ADMIN", mobileVerified: true, lang: "en",
    });
    console.log(`Admin created → mobile ${adminMobile} / password ${adminPass}  (change it after first login!)`);
  }

}

async function demo() {
  const [comm] = await db.select().from(t.communities).where(eq(t.communities.slug, "dashora-nagar-brahman"));
  const names = [
    ["Aditya Joshi", "MALE"], ["Rohit Dave", "MALE"], ["Karan Trivedi", "MALE"], ["Nikhil Vyas", "MALE"],
    ["Siddharth Pandya", "MALE"], ["Mayank Bhatt", "MALE"], ["Harsh Mehta", "MALE"], ["Ankit Nagar", "MALE"],
    ["Priya Joshi", "FEMALE"], ["Neha Dave", "FEMALE"], ["Shruti Trivedi", "FEMALE"], ["Pooja Vyas", "FEMALE"],
    ["Ritika Pandya", "FEMALE"], ["Aishwarya Bhatt", "FEMALE"], ["Kavya Mehta", "FEMALE"], ["Sneha Nagar", "FEMALE"],
  ];
  const cities = ["Udaipur", "Jaipur", "Ahmedabad", "Indore", "Pune", "Bengaluru", "Mumbai", "Chittorgarh"];
  const edu = ["graduate", "post_graduate", "professional", "graduate"];
  const occ = ["private_job", "government_job", "business", "professional"];
  const pass = await bcrypt.hash("demo123", 10);
  for (const [i, [name, gender]] of names.entries()) {
    const mobile = `+9190000000${String(i).padStart(2, "0")}`;
    const [ex] = await db.select().from(t.users).where(eq(t.users.mobile, mobile));
    if (ex) continue;
    const [u] = await db.insert(t.users).values({ name, mobile, passwordHash: pass, mobileVerified: true, credits: 3 }).returning();
    const dob = new Date(1992 + (i % 8), i % 12, 5 + i);
    const [p] = await db.insert(t.profiles).values({
      code: `DNB${1001 + i}`, userId: u.id, communityId: comm.id, fullName: name, gender,
      dateOfBirth: dob, status: "APPROVED", photoVerified: i % 3 === 0,
      data: {
        profile_created_by: i % 2 ? "parent" : "self", marital_status: "never_married",
        height: gender === "MALE" ? 170 + (i % 5) * 3 : 155 + (i % 5) * 3, complexion: ["fair", "wheatish", "very_fair"][i % 3],
        mother_tongue: ["mewari", "hindi", "gujarati"][i % 3], diet: "veg", smoking: "no", drinking: "no",
        gotra: ["Kashyap", "Bharadwaj", "Vashishtha", "Gautam"][i % 4], rashi: ["mesh", "kark", "tula", "makar"][i % 4],
        manglik: i % 4 === 0 ? "yes" : "no", education_level: edu[i % 4], education_detail: ["B.Tech", "MBA", "CA", "M.Sc"][i % 4],
        occupation_type: occ[i % 4], occupation: ["Software Engineer", "Teacher", "Family business", "Chartered Accountant"][i % 4],
        annual_income: ["5_10l", "10_15l", "15_25l", "3_5l"][i % 4], work_city: cities[i % 8],
        father_name: `Shri ${name.split(" ")[1]} ji`, family_type: i % 2 ? "joint" : "nuclear", native_place: "Udaipur",
        current_city: cities[(i + 3) % 8], current_state: ["rajasthan", "gujarat", "madhya_pradesh", "maharashtra"][i % 4],
        brothers: i % 3, sisters: (i + 1) % 3,
        about_me: "Simple, family-oriented and positive person. Values traditions while being modern in outlook.",
        address: "12, Shastri Nagar, Udaipur, Rajasthan",
      },
    }).returning();
    await db.insert(t.contacts).values([
      { profileId: p.id, name: `Shri ${name.split(" ")[1]} ji`, relation: "FATHER", phone: `+91981000${String(1000 + i)}`, whatsapp: true, isPrimary: true },
      { profileId: p.id, name, relation: "SELF", phone: mobile },
    ]);
  }
  await db.insert(t.counters).values({ name: "profile:DNB", value: 1000 + names.length }).onConflictDoNothing();
  console.log("Demo profiles added (password for all demo accounts: demo123, mobiles +919000000000 … +919000000015)");
}

main().catch((e) => { console.error(e); process.exit(1); });
