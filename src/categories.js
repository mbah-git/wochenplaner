const { cleanName } = require('./ingredients');

// Kategorien der Einkaufsliste in der Reihenfolge eines typischen Einkaufs
// und eine automatische Zuordnung von Zutaten ueber Stichwoerter.

const CATEGORIES = [
  { key: 'gemuese', label: 'Obst & Gemüse' },
  { key: 'brot', label: 'Brot & Backwaren' },
  { key: 'milch', label: 'Milchprodukte & Eier' },
  { key: 'fleisch', label: 'Fleisch & Fisch' },
  { key: 'vorrat', label: 'Teigwaren, Reis & Vorrat' },
  { key: 'gewuerze', label: 'Gewürze, Öle & Saucen' },
  { key: 'tiefkuehl', label: 'Tiefkühl' },
  { key: 'getraenke', label: 'Getränke' },
  { key: 'haushalt', label: 'Haushalt & Drogerie' },
  { key: 'sonstiges', label: 'Sonstiges' },
];
const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

const KEYWORDS = {
  gemuese: `apfel aubergine avocado banane basilikum beere birne blumenkohl bohne brokkoli broccoli champignon chili
    dill erbse erdbeere fenchel frühlingszwiebel gemüse gurke himbeere ingwer kartoffel karotte kirsche kiwi knoblauch
    kohl kohlrabi koriander kräuter kürbis lauch limette mais mango melone minze möhre nektarine orange paprika
    pastinake peperoni petersilie pfirsich pilz porree radieschen rande rosmarin rucola rüebli salat schalotte
    schnittlauch sellerie spargel spinat süsskartoffel thymian tomate traube zitrone zucchetti zucchini zwiebel peperoncini
    cherrytomate rotkohl weisskohl wirsing randen federkohl grünkohl rosenkohl lattich eisberg nüsslisalat`,
  brot: `baguette brot brötchen brötli brezel toast tortilla wrap fladenbrot ciabatta zopf gipfeli croissant pita
    burgerbrötchen paniermehl semmel teig blätterteig kuchenteig pizzateig`,
  milch: `butter buttermilch ei eier feta frischkäse gorgonzola gouda halbrahm joghurt jogurt käse kefir mascarpone milch
    mozzarella parmesan quark rahm ricotta sahne schmand sbrinz skyr emmentaler gruyère greyerzer raclettekäse
    crème fraîche creme fraiche saucenhalbrahm schlagrahm sauerrahm hüttenkäse cottage cheese halloumi pecorino`,
  fleisch: `bratwurst cervelat fisch fleisch forelle garnele crevette geschnetzeltes hack hackfleisch hähnchen huhn
    poulet kalb lachs lamm rind rindfleisch schinken schwein speck thunfisch steak wurst salami pouletbrust
    entrecôte filet kotelett chorizo pancetta prosciutto lardons wienerli`,
  vorrat: `bohnen aus der dose couscous bulgur dinkel getreide gnocchi haferflocken kichererbse kokosmilch linse
    mais aus der dose mehl müesli nudel nuss mandel nüsse pasta penne polenta quinoa reis risottoreis rosine
    spaghetti tagliatelle lasagneblätter lasagne tomatenmark passata pelati tomaten aus der dose zucker
    honig marmelade konfitüre schokolade backpulver hefe vanillezucker stärke maizena brühe bouillon
    gemüsebrühe hühnerbrühe fond kapern oliven sesam pinienkerne erdnuss cashew walnuss haselnuss sonnenblumenkerne
    kokosraspel tortellini ravioli fusilli farfalle rigatoni makkaroni hörnli spätzli knöpfli glasnudel reisnudel teigwaren`,
  gewuerze: `essig gewürz kreuzkümmel kurkuma ketchup mayonnaise mayo muskat oregano öl olivenöl paprikapulver
    pfeffer rapsöl salz senf sojasauce sojasosse sauce sosse sriracha tabasco zimt curry currypaste
    chiliflocken cayenne lorbeer nelke balsamico worcestershire sambal harissa pesto sesamöl fischsauce
    rotweinessig weissweinessig aromat kräutersalz garam masala`,
  tiefkuehl: `tiefkühl tk-erbsen tk-spinat glace eis rahmspinat pommes frites fischstäbchen tiefgekühlt`,
  getraenke: `bier mineralwasser saft wasser wein weisswein rotwein cola limonade sirup kaffee tee prosecco`,
  haushalt: `alufolie backpapier frischhaltefolie geschirrspülmittel spülmittel küchenpapier müllbeutel abfallsack
    seife shampoo taschentuch toilettenpapier waschmittel zahnpasta schwamm`,
};

// Stichwoerter einmal vorbereiten: [stichwort, kategorie]
const ENTRIES = [];
for (const [category, words] of Object.entries(KEYWORDS)) {
  // Mehrwort-Begriffe (z. B. "crème fraîche") bleiben zusammen, sonst an Leerzeichen trennen
  const phrases = ['crème fraîche', 'creme fraiche', 'cottage cheese', 'garam masala', 'pommes frites',
    'bohnen aus der dose', 'mais aus der dose', 'tomaten aus der dose'];
  let rest = ` ${words.replace(/\s+/g, ' ')} `;
  for (const p of phrases) {
    if (rest.includes(` ${p} `)) {
      ENTRIES.push([p, category]);
      rest = rest.replace(` ${p} `, ' ');
    }
  }
  for (const w of rest.trim().split(' ')) if (w) ENTRIES.push([w, category]);
}

// Bestes Stichwort: Treffer am Wortende gewinnt (im Deutschen bestimmt das letzte Wortteil
// die Bedeutung: "Kokosmilch", "Gemüsebrühe", "Paprikapulver"), danach das laengere Stichwort.
function guessCategory(name) {
  const text = cleanName(name || '').toLowerCase();
  let best = null;
  for (const [word, category] of ENTRIES) {
    const idx = text.lastIndexOf(word);
    if (idx < 0) continue;
    const end = idx + word.length;
    const atWordEnd = end === text.length || /[^a-zäöüéèàâêîôûç]/.test(text[end]) ||
      // Pluralendungen: "Tomaten", "Zwiebeln", "Champignons" (nicht bei kurzen Stichwoertern wie "ei")
      (word.length > 3 && /^(n|en|s|e|er|nen)(?![a-zäöü])/.test(text.slice(end)));
    // Mitten im Wort zaehlen nur laengere Stichwoerter ("Knoblauch" in "Knoblauchzehe", nicht "ei" in "Teig")
    if (!atWordEnd && word.length < 4) continue;
    const score = (atWordEnd ? 10000 : 0) + end * 10 + word.length;
    if (!best || score > best.score) best = { score, category };
  }
  return best ? best.category : 'sonstiges';
}

function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.label : 'Sonstiges';
}

function isCategory(key) {
  return CATEGORY_KEYS.has(key);
}

module.exports = { CATEGORIES, guessCategory, categoryLabel, isCategory };
