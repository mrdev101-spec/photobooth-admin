import 'server-only';

/**
 * Generation briefs of the built-in AI Studio scenes (moved from the kiosk's aiStudio.cjs).
 * Server-only: prompts are never sent to browsers or kiosks; kiosks send a scene id + photo.
 */
export interface ScenePrompt {
  baseGender: 'female' | 'male';
  category?: string;
  /** 'postcard' = travel postcard composition; default = movie poster. */
  style?: 'postcard';
  /** Thai lettering in the title: drawn by a GPT Image model (others misspell Thai). */
  thaiText?: boolean;
  genre: string;
  title: string;
  titleStyle: string;
  titlePos: string;
  tagline?: string;
  taglinePos?: string;
  setting: string;
  lighting: string;
  female: string;
  male: string;
  hairFemale: string;
  hairMale: string;
  pose?: string;
  framing?: string;
  camera?: string;
}

export const SCENE_PROMPTS: Record<string, ScenePrompt> = {
  "neon-city": {
    baseGender: "female",
    genre: "bold cyberpunk action",
    title: "NEON DREAMS",
    titleStyle: "huge bold condensed chrome",
    titlePos: "across the top",
    tagline: "THE CITY NEVER SLEEPS",
    taglinePos: "above the title",
    setting: "standing on a rain-soaked rooftop of a futuristic neon megacity at night, holographic billboards, light rain",
    lighting: "violet and cyan neon rim light, wet reflections, deep blue shadows",
    female: "a black techwear jacket with glowing cyan trim",
    male: "a black techwear jacket with glowing cyan trim and a high collar",
    hairFemale: "a sleek high ponytail with blunt straight bangs, glossy black hair with a subtle cyan-violet neon sheen",
    hairMale: "a short textured undercut, black hair swept up, slightly wet from the rain"
  },
  astronaut: {
    baseGender: "male",
    genre: "epic space adventure",
    title: "BEYOND THE STARS",
    titleStyle: "huge bold futuristic",
    titlePos: "in the bottom third",
    tagline: "ONE SMALL STEP. ONE GIANT LEGEND.",
    taglinePos: "at the top",
    setting: "aboard a spacecraft with planet Earth and a vivid starfield seen from orbit behind them, sun lens flare",
    lighting: "soft blue earthlight on the face with a warm sun rim light",
    female: "a detailed white astronaut suit, helmet removed and held at her side (no real agency logos or flags)",
    male: "a detailed white astronaut suit, helmet removed and held at his side (no real agency logos or flags)",
    hairFemale: "a neat low bun with a few soft loose strands, natural dark brown hair",
    hairMale: "a short clean crew cut, natural black hair"
  },
  hollywood: {
    baseGender: "female",
    genre: "glamorous golden-age Hollywood style",
    title: "BORN TO SHINE",
    titleStyle: "elegant large gold serif",
    titlePos: "near the bottom",
    tagline: "TONIGHT, THE SPOTLIGHT IS YOURS",
    taglinePos: "at the top",
    setting: "in front of a deep red velvet stage curtain inside golden art-deco frame lines, a sparkling spotlight halo behind them",
    lighting: "dramatic warm golden spotlight key light with soft glamour fill",
    female: "a satin champagne evening gown with pearls",
    male: "a black tuxedo with a satin bow tie",
    hairFemale: "classic Old-Hollywood glamour waves, glossy, shoulder length with a deep side part",
    hairMale: "slicked-back classic side-parted hair, glossy and neat"
  },
  rockstar: {
    baseGender: "male",
    genre: "high-energy rock concert film",
    title: "LOUDER THAN LIFE",
    titleStyle: "huge distressed bold grunge",
    titlePos: "across the top",
    tagline: "ONE NIGHT. ONE STAGE. ONE LEGEND.",
    taglinePos: "at the bottom above the credit line",
    setting: "on a huge concert stage holding an electric guitar, a roaring crowd silhouette and haze, stage truss lights behind them",
    lighting: "hot magenta and orange stage spotlights from behind with smoky haze and a crisp white front key light",
    female: "a black leather jacket over a band-style tee (no real band names), silver jewellery",
    male: "a black leather jacket over a band-style tee (no real band names), silver chain",
    hairFemale: "long tousled layered rock-star hair with volume, dark with a subtle burgundy tint",
    hairMale: "messy medium-length rocker hair falling over the ears, dark"
  },
  superhero: {
    baseGender: "female",
    genre: "blockbuster superhero",
    title: "RISE OF A HERO",
    titleStyle: "massive bold metallic",
    titlePos: "in the bottom third",
    tagline: "EVERY CITY NEEDS A HERO",
    taglinePos: "at the top",
    setting: "standing on a skyscraper ledge above a city at golden hour, dramatic clouds, sparks of energy in the air",
    lighting: "epic golden-hour backlight with a cool blue fill and sharp heroic rim light",
    female: "an original sleek armoured hero suit in deep navy and gold with a flowing cape (no existing hero logos or costumes)",
    male: "an original sleek armoured hero suit in deep navy and gold with a flowing cape (no existing hero logos or costumes)",
    hairFemale: "long wind-swept heroic hair flowing back, dark brown",
    hairMale: "short swept-back heroic hair with volume, black"
  },
  "seoul-romance": {
    baseGender: "female",
    genre: "soft Korean romance drama",
    title: "SPRING IN SEOUL",
    titleStyle: "elegant thin modern serif",
    titlePos: "in the upper third",
    tagline: "SOME LOVE STORIES BLOOM ONLY ONCE",
    taglinePos: "under the title",
    setting: "on a street lined with cherry blossom trees in full bloom, petals floating in the air, a softly blurred Seoul street behind them",
    lighting: "bright soft pastel daylight, gentle backlight glow, airy pink and cream tones",
    female: "a cream knit cardigan over a white blouse",
    male: "a light beige trench coat over a white shirt",
    hairFemale: "soft long Korean layered hair with airy see-through bangs and gentle waves, dark brown",
    hairMale: "Korean-style soft comma hair with a natural fringe, dark brown"
  },
  noir: {
    baseGender: "male",
    genre: "stylish black-and-white film noir detective",
    title: "MIDNIGHT CASE",
    titleStyle: "bold art-deco in blood red",
    titlePos: "across the bottom third",
    tagline: "IN THIS CITY, EVERYONE HAS A SECRET",
    taglinePos: "at the top",
    setting: "on a rainy night street under a single street lamp, venetian-blind shadows, wet cobblestones",
    lighting: "high-contrast black-and-white chiaroscuro with hard side light; only the title is red",
    female: "a belted trench coat and a fedora",
    male: "a belted trench coat and a fedora",
    hairFemale: "1940s finger waves, shoulder length, under the fedora",
    hairMale: "short neatly combed 1940s side part under the fedora"
  },
  fantasy: {
    baseGender: "female",
    genre: "epic high-fantasy",
    title: "THE LAST KINGDOM",
    titleStyle: "grand engraved gold",
    titlePos: "in the bottom third",
    tagline: "A CROWN IS EARNED, NOT GIVEN",
    taglinePos: "at the top",
    setting: "in front of a majestic castle on a cliff at sunset, a dragon silhouette circling in the sky, glowing embers",
    lighting: "warm sunset key light with glowing ember highlights and cool mist in the shadows",
    female: "ornate royal armour with a flowing crimson cape and a delicate crown",
    male: "ornate royal armour with a flowing crimson cape and a simple crown",
    hairFemale: "long flowing royal hair with loose waves and small braids under the crown, dark brown",
    hairMale: "medium-length swept-back hair under the crown, dark brown"
  },
  racing: {
    baseGender: "male",
    genre: "adrenaline motorsport action",
    title: "FULL THROTTLE",
    titleStyle: "aggressive italic bold with speed streaks",
    titlePos: "across the top",
    tagline: "NO BRAKES. NO LIMITS.",
    taglinePos: "at the bottom above the credit line",
    setting: "on a race track at night holding a racing helmet, a sleek race car with motion-blurred lights behind them",
    lighting: "cool floodlights with red and white motion-blur light trails",
    female: "a white and red racing suit with generic sponsor-free patches",
    male: "a white and red racing suit with generic sponsor-free patches",
    hairFemale: "a sporty high ponytail, straight and sleek, dark",
    hairMale: "short sporty textured hair, slightly messy, dark"
  },
  "lost-temple": {
    baseGender: "female",
    genre: "jungle treasure-hunting adventure",
    title: "LOST TEMPLE",
    titleStyle: "huge chiselled stone-textured",
    titlePos: "in the bottom third",
    tagline: "ADVENTURE HAS A NEW NAME",
    taglinePos: "at the top",
    setting: "at the entrance of ancient overgrown temple ruins deep in a misty jungle, god rays through the canopy, a glowing golden relic nearby",
    lighting: "warm god rays through mist with lush green bounce light",
    female: "a khaki explorer shirt with rolled sleeves, a leather satchel strap and a canvas hat",
    male: "a khaki explorer shirt with rolled sleeves, a leather satchel strap and a canvas hat",
    hairFemale: "a loose low braid with natural flyaways under the canvas hat, dark brown",
    hairMale: "short rugged tousled hair under the canvas hat, dark brown"
  },
  songkran: {
    category: "festival",
    style: "postcard",
    baseGender: "female",
    genre: "of the joyful Songkran water festival in Thailand",
    thaiText: true,
    title: "สงกรานต์",
    titleStyle: "a big playful rounded bold Thai display typeface (like the Thai font Mali): white-to-aqua gradient letters with a thick deep-blue outline, a soft glow, and water droplets and splashes flying off the letters",
    titlePos: "large across the top in the sky",
    setting: "on a festive Bangkok street decorated with colourful bunting and paper flags, sparkling water splashes frozen mid-air around them, silver bowls of water and jasmine garlands nearby",
    lighting: "bright tropical midday sun, glittering water droplets, vivid saturated colours",
    female: "a bright floral Hawaiian-style shirt with a jasmine flower garland (phuang malai) around the neck",
    male: "a bright floral Hawaiian-style shirt with a jasmine flower garland, holding a colourful water gun",
    hairFemale: "shoulder-length hair in a cute half-up ponytail, sparkling with a few water drops",
    hairMale: "short textured hair, slightly wet and tousled from the water"
  },
  "loy-krathong": {
    category: "festival",
    style: "postcard",
    baseGender: "female",
    genre: "of the Loy Krathong festival night in Thailand",
    thaiText: true,
    title: "ลอยกระทง",
    titleStyle: "an elegant flowing Thai calligraphic typeface (like the Thai font Charmonman): shining gold gradient letters with a warm candle-light glow, a thin dark outline and a few small sparkling stars around",
    titlePos: "large across the top in the night sky",
    setting: "kneeling by a calm river at night under a full moon, holding a beautiful banana-leaf krathong with flowers, a lit candle and incense, many glowing krathongs floating on the water, a softly lit Thai temple on the far bank",
    lighting: "warm golden candlelight on the face, cool silver moonlight, glowing reflections on the water",
    female: "a traditional Thai dress (chut thai) in silk with a draped sabai and gold jewellery",
    male: "a traditional Thai raj-pattern silk shirt (suea phraratchathan) with a silk pha nung",
    hairFemale: "an elegant low bun adorned with small jasmine and gold flower pins",
    hairMale: "short neatly combed hair"
  },
  "yi-peng": {
    category: "festival",
    style: "postcard",
    baseGender: "female",
    genre: "of the Yi Peng lantern festival in Chiang Mai",
    thaiText: true,
    title: "ยี่เป็ง",
    titleStyle: "a traditional decorative Thai typeface with Lanna flourishes (like the Thai font Srisakdi): warm orange-gold letters glowing like lantern light, a dark brown outline and small floating lantern glows around",
    titlePos: "large across the top in the night sky",
    setting: "at night in Chiang Mai holding a glowing paper khom loi lantern about to be released, hundreds of floating lanterns rising into a starry sky, a Lanna temple silhouette behind",
    lighting: "soft warm orange lantern glow on the face against a deep blue night sky, dreamy bokeh",
    female: "a traditional Lanna northern Thai outfit: a woven pha sin tube skirt, a fitted silk blouse and a draped shawl",
    male: "a traditional Lanna indigo cotton shirt (suea mo hom) with a checked pha khao ma sash",
    hairFemale: "a neat Lanna-style high bun decorated with a fresh orchid",
    hairMale: "short natural side-swept hair"
  },
  "chinese-new-year": {
    category: "festival",
    style: "postcard",
    baseGender: "female",
    genre: "of Chinese New Year celebrations in Bangkok Chinatown",
    thaiText: true,
    title: "ตรุษจีน",
    titleStyle: "a bold ornamental Thai display typeface (like the Thai font Chonburi): rich embossed gold letters with a deep red outline, a festive golden glow and small gold sparkles",
    titlePos: "large across the top above the lanterns",
    setting: "on Yaowarat Road, Bangkok Chinatown, decorated for Chinese New Year: rows of red lanterns overhead, golden decorations, glowing neon shop signs that show only abstract shapes and colours",
    lighting: "warm red and gold lantern light, festive glow and soft bokeh",
    female: "a red silk qipao with gold embroidery",
    male: "a red and gold Tang-style silk jacket with a mandarin collar",
    hairFemale: "a sleek low bun with a red flower hairpin and soft face-framing strands",
    hairMale: "short neat side-parted hair"
  },
  "wat-arun": {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of Bangkok, Thailand",
    title: "WAT ARUN · BANGKOK",
    titleStyle: "classic vintage travel-postcard lettering",
    titlePos: "across the top",
    setting: "on the riverside promenade of the Chao Phraya River with the spires of Wat Arun (Temple of Dawn) in full view behind them across the water, a long-tail boat passing",
    lighting: "warm golden-hour sunset light, the temple glowing, soft river reflections",
    female: "a modern Thai-inspired silk outfit: a pastel sabai top with a flowing pha sin skirt",
    male: "a white Thai raj-pattern shirt with tailored trousers",
    hairFemale: "long soft waves tucked behind one ear with a small orchid",
    hairMale: "short neat textured hair"
  },
  "phi-phi": {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of the Phi Phi Islands, Krabi, Thailand",
    title: "PHI PHI ISLANDS",
    titleStyle: "fresh bold tropical postcard lettering",
    titlePos: "across the top",
    setting: "on the white-sand beach of Maya Bay with turquoise water, towering limestone cliffs and a traditional long-tail boat with colourful ribbons on its bow",
    lighting: "bright tropical sunshine, clear blue sky, vivid turquoise and emerald tones",
    female: "a flowy white linen beach dress",
    male: "an open short-sleeve linen beach shirt over a white tee",
    hairFemale: "long beach waves blowing gently in the sea breeze",
    hairMale: "short tousled beach hair"
  },
  "doi-inthanon": {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of Doi Inthanon, the highest mountain in Thailand, Chiang Mai, shot like a premium travel-magazine cover",
    title: "DOI INTHANON",
    titleStyle: "elegant large white serif lettering with a thin gold line and the small words \"CHIANG MAI · THAILAND\" spaced underneath",
    titlePos: "across the top in the sky",
    setting: "on the flower-filled ridge-top garden of Doi Inthanon at dawn, the twin royal pagodas standing side by side behind them at the same size and height on the ridge (Phra Mahathat Naphamethanidon, a terracotta-brown tiered chedi with gold details, and Phra Mahathat Naphaphonphumisiri, a lilac-purple tiered chedi with gold spires), a vast golden sea of clouds filling the valleys below and layered blue mountain ridges fading into the distance, pink wild Himalayan cherry blossom branches framing the scene",
    lighting: "magical golden-hour sunrise: warm sunbeams breaking through drifting mist, glowing rim light on hair and shoulders, soft warm light on the face, cool blue tones in the valleys, rich cinematic contrast",
    female: "a cream oversized cable-knit sweater with a soft mustard-yellow wool scarf and a camel wool coat",
    male: "a cream knit turtleneck under a camel corduroy jacket with a soft wool scarf",
    hairFemale: "long soft layered hair with gentle waves, a few strands lifted by the mountain breeze, dark brown",
    hairMale: "short textured side-swept hair, lightly windswept, dark brown"
  },
  "red-lotus-sea": {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of the Red Lotus Sea (Talay Bua Daeng) on Nong Han Kumphawapi lake, Udon Thani, Thailand, shot like a premium travel-magazine cover",
    title: "RED LOTUS SEA",
    titleStyle: "elegant large white serif lettering with the small words \"UDON THANI · THAILAND\" spaced underneath",
    titlePos: "across the top in the sky",
    setting: "sitting in a small wooden long-tail boat gliding through a vast lake carpeted to the horizon with thousands of blooming pink-red lotus flowers and round green lotus leaves, a soft morning mist drifting over the water",
    lighting: "soft early-morning sunrise light, pastel pink and peach sky, gentle mist, warm glow on the face, the lotus flowers glowing in the low sun",
    female: "a flowing white linen dress with delicate embroidery",
    male: "a light cream linen shirt with rolled sleeves and beige linen trousers (no dress or skirt)",
    hairFemale: "long soft waves with a pink lotus flower tucked behind one ear",
    hairMale: "short neat natural hair, dark, with no flower or accessory in the hair"
  },
  ayutthaya: {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of the ancient city of Ayutthaya, Thailand",
    title: "AYUTTHAYA",
    titleStyle: "regal gold heritage postcard lettering",
    titlePos: "across the top",
    setting: "among the ancient brick chedis and prangs of Wat Chaiwatthanaram in the Ayutthaya Historical Park",
    lighting: "warm late-afternoon sunlight, golden brick tones, soft long shadows",
    female: "a traditional Ayutthaya-period Thai costume: a draped silk sabai and a pleated pha nung in gold and burgundy with gold jewellery",
    male: "a traditional Ayutthaya-period Thai costume: a silk raj-pattern shirt with a pha nung chong kraben in gold and burgundy",
    hairFemale: "a traditional high Thai bun (mun muay) with a gold hair ornament",
    hairMale: "short neat hair"
  },
  yaowarat: {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of Yaowarat Road, Bangkok Chinatown at night, shot like a cool street-fashion magazine cover",
    title: "YAOWARAT",
    titleStyle: "bold modern condensed white lettering with a red neon glow and the small words \"BANGKOK CHINATOWN\" spaced underneath",
    titlePos: "across the top",
    setting: "standing in the middle of Yaowarat Road at night, rows of glowing red and gold neon shop signs stacked up the old shophouses on both sides (signs show only abstract shapes and colours, never letters), red lanterns, a vintage tuk-tuk with light trails passing behind, the wet street reflecting all the neon",
    lighting: "moody cinematic night light: saturated red and warm gold neon key light with teal shadows, glossy reflections, soft haze and bokeh, high contrast",
    pose: "a cool, confident street-fashion pose: body slightly turned, one hand in a pocket or casually adjusting the jacket collar, chin slightly down, a calm self-assured gaze into the camera with a subtle smirk, effortlessly chic like an editorial fashion shoot (never a cheesy grin)",
    female: "an oversized black leather jacket over a fitted silk camisole in deep red, high-waisted black wide-leg trousers and small gold hoop earrings",
    male: "a black bomber jacket over a red and gold printed silk shirt, black slim trousers and a thin silver chain",
    hairFemale: "sleek long straight hair with a sharp centre part, glossy",
    hairMale: "slicked-back textured hair with a few loose strands"
  },
  "yaowarat-candid": {
    category: "thailand",
    style: "postcard",
    baseGender: "female",
    genre: "of Yaowarat Road, Bangkok Chinatown at night, a candid street-fashion photo by a professional photographer",
    title: "YAOWARAT",
    titleStyle: "bold modern condensed white lettering with a soft red neon glow and the small words \"BANGKOK CHINATOWN\" spaced underneath",
    titlePos: "across the top",
    setting: "walking along the busy neon-lit sidewalk of Yaowarat Road at night, glowing red and gold shop signs stacked up the old shophouses (signs show only abstract shapes and colours, never letters), red lanterns, street-food stall lights, a few tuk-tuk light trails on the wet street",
    lighting: "a crisp off-camera flash on the subject (clean, slightly punchy, editorial) blended with the warm red and gold neon ambience, teal shadows, glossy reflections",
    framing: "framed from the knees up (three-quarter body) mid-stride",
    pose: "a candid unposed moment: caught mid-stride while walking, not posing, glancing slightly off-camera or back over the shoulder with a relaxed natural expression, hair and jacket moving with the walk, effortlessly cool like a paparazzi street-style shot",
    camera: "shot from across the street with an 85-135 mm telephoto lens at a wide aperture: strongly compressed perspective, the neon background melted into large creamy bokeh, the subject tack-sharp and separated from the background",
    female: "a cropped black leather jacket over a fitted white top, a red satin midi skirt and black ankle boots, small gold hoop earrings",
    male: "a black leather jacket over a white tee, dark tapered trousers and black boots, a thin silver chain",
    hairFemale: "long glossy loose waves moving with the walk",
    hairMale: "textured messy quiff with movement"
  },
  "yaowarat-tuktuk": {
    category: "thailand",
    style: "postcard",
    baseGender: "male",
    genre: "of Yaowarat Road, Bangkok Chinatown at night, a cool street-fashion portrait by a professional photographer",
    title: "YAOWARAT",
    titleStyle: "bold modern condensed white lettering with a red neon glow and the small words \"BANGKOK CHINATOWN\" spaced underneath",
    titlePos: "across the top",
    setting: "leaning back against a parked classic Thai tuk-tuk with glowing chrome details on Yaowarat Road at night, red and gold neon shop signs and red lanterns behind (signs show only abstract shapes and colours, never letters), the wet street reflecting the neon",
    lighting: "professional flash portrait lighting: a soft key flash from the side with a red neon rim light and teal shadows, glossy reflections on the tuk-tuk and the street, cinematic contrast",
    framing: "framed from the knees up (three-quarter body) with the tuk-tuk clearly visible",
    pose: "a cool, relaxed leaning pose against the tuk-tuk: arms crossed or one elbow resting on the tuk-tuk roof bar, one leg crossed over the other, chin slightly lifted, a confident calm gaze into the camera with a subtle smirk, effortlessly cool",
    camera: "shot with a 50-85 mm lens, shallow depth of field, neon bokeh behind",
    female: "an oversized black leather jacket over a black lace-trimmed slip top, black leather trousers, gold hoop earrings and a small chain bag",
    male: "an open black and red patterned silk shirt over a white tank top, black trousers, a silver chain and a watch",
    hairFemale: "sleek high ponytail with a few face-framing strands",
    hairMale: "slicked-back textured hair"
  }
};
