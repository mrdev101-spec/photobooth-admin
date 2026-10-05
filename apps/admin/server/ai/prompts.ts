import 'server-only';
import type { ScenePrompt } from './scene-prompts';

/*
 * Customer-photo prompts, moved verbatim from the kiosk's aiStudio.cjs (where they still serve
 * kiosks that are not registered, or run in emergency mode with a key of their own).
 * Scene art (posters / plates) is not generated here: it is published as template files.
 */

// Thai lettering: exact spelling, a real Thai typeface, no English
const thaiTextRule = (tmpl: ScenePrompt): string => `THAI TITLE: write the Thai words "${tmpl.title}" exactly as given, character by character, with every consonant, vowel and tone mark correct and in place (marks above and below the line included); do not translate, transliterate or add English words; render it as ${tmpl.titleStyle}, crisp and perfectly legible`;

// Shared quality bar for everything we generate: posters must print crisp, not grainy
const QUALITY_RULES = 'Ultra sharp, clean, high-resolution professional commercial finish: crisp edges, clean smooth skin texture with natural detail, no film grain, no noise, no blur, no compression artifacts, no JPEG blocks. Typography must be perfectly legible, correctly spelled, sharp and professionally kerned. The ONLY words in the image are the ones quoted in this prompt: no credits block, no fine print, no extra captions, and any signs, billboards or screens in the background show only abstract shapes and colours, never letters.';

// Identity = the face only (from the hairline down): hair, hairstyle and wardrobe come from the template
const IDENTITY_SPEC = 'skull and bone structure, face shape, width and length, forehead, jawline, chin, cheekbones, eye shape, size, spacing and tilt, eyelids and eye colour, eyebrow shape, thickness and position, nose bridge, width and tip, nostrils, philtrum, lip shape, width and fullness, smile and teeth, ears, natural skin tone (only re-graded by the scene lighting and evened out by the retouch), clearly distinctive moles, facial hair if any, glasses if worn, apparent age, and the exact same expression; every facial proportion identical to the photo, as if it were the same photograph of the same face';

// Hair is NOT part of the identity: everyone gets the template's hairstyle
const HAIR_RULES = 'Do NOT copy the hairstyle, hair length, fringe, parting, hair colour, hats or hair accessories from the customer photo; ignore them completely. Give each person the poster\'s own hairstyle described below, fitted naturally to their real head shape, forehead and face (realistic hairline and strands, no wig look), lit and colour-graded with the scene';
const hairFor = (tmpl: ScenePrompt): string => `women: ${tmpl.hairFemale}; men: ${tmpl.hairMale}`;

const LIGHTING_SPEC = 'relight every customer to match the poster: same key-light direction and softness, same colour temperature, matching rim-light colours, consistent contrast, shadows, highlights and black levels on faces, skin and clothes, subtle colour spill from the environment on skin, contact shadows and ambient occlusion under the chin, jaw, hair and where bodies meet the scene, the scene\'s haze, particles or rain passing in front of and around the person, one unified colour grade across skin and background; never a flat, pasted-on, cut-out or differently lit look';

// Skin: the retouch a professional poster gets, applied without changing who the person is
const SKIN_SPEC = 'professional high-end beauty retouch on every face, always (whatever the quality of the customer photo): smooth, clear, even-toned, luminous skin with a natural healthy glow; remove acne, pimples, acne marks and scars, dark spots, freckles, pigmentation and melasma patches, redness, blotchiness, uneven patches, oily shine, enlarged pores, under-eye circles and bags, and stray hairs; soften wrinkles and fine lines (forehead lines, crow\'s feet, smile lines, under-eye lines) so the skin looks fresh and smooth while the face still reads as the same person of about the same age; keep only clearly distinctive moles; keep a fine natural skin texture (never plastic, waxy, blurred or airbrushed flat); keep the person\'s own skin tone (no whitening or darkening beyond the scene lighting) and never reshape any feature; skin tone and skin shadows blend seamlessly into the scene colour grade so face, neck, ears and hands all match'

// Sharpness: the customer must be as crisp as the poster itself
// Depth on the face: light and shadow follow the scene's key light
const FACE_DIMENSION_SPEC = 'natural three-dimensional facial modelling from the scene\'s own key light: soft highlights on the forehead, nose bridge, cheekbones, cupid\'s bow and chin, gentle shadows under the cheekbones, along the jaw, at the sides of the nose and under the chin, a soft catchlight in each eye, so the face has depth and shape instead of looking flat or pasted on';

// The camera photo may be soft, noisy, dim or low resolution: never carry that into the result
const SOURCE_QUALITY_SPEC = 'the customer photo is only an identity reference and may be blurry, noisy, dim, low-resolution or unevenly lit: reconstruct each face as a clean, sharp, high-resolution, well-lit professional photograph of the same person; never copy blur, noise, grain, compression artefacts, harsh shadows, colour casts or bad lighting from the photo into the result';

const SHARPNESS_SPEC = 'the customer is in razor-sharp focus with the same resolution and micro-detail as the poster: crisp eyes and catchlights, individual eyelashes, eyebrow and hair strands, lips and fabric texture; no soft, low-resolution, upscaled or smeared look on the face or body';

const PROPORTION_SPEC = 'realistic human proportions (natural head-to-shoulder and head-to-body ratio, no oversized head or shrunken body, natural neck length), scale, eye level and camera perspective consistent with the poster, correct depth of field and natural occlusion';

// Prompt for turning the customer photo into the poster
export function portraitPrompt(tmpl: ScenePrompt, { hasCrop, hasPlate }: { hasCrop: boolean; hasPlate: boolean }): string {
  const plateIdx = hasCrop ? 3 : 2;
  return [
    'IMAGE 1 is the original photo of the real customer(s). They are the ONLY people who may appear in the result.',
    hasCrop && 'IMAGE 2 is a zoomed-in crop of IMAGE 1 showing the same customer(s) in more detail; use it only for facial detail, it does NOT show additional people.',
    hasPlate && `IMAGE ${plateIdx} is the finished poster design with no people in it: keep its background, colour palette, layout and ALL of its text exactly as they are (same words, same font style, same positions).`,
    tmpl.thaiText && `${thaiTextRule(tmpl)}; it must look exactly like the title in the poster design.`,
    `IDENTITY (highest priority): take ONLY the face of each customer from IMAGE 1 and reproduce it as a 100% exact photographic likeness: ${IDENTITY_SPEC}. Do not reshape, slim, de-age, beautify the features, enlarge the eyes, change ethnicity or blend with any other face; a friend must recognise them instantly.`,
    `HAIR (from the poster, not from the photo): ${HAIR_RULES}. Poster hairstyle: ${hairFor(tmpl)}.`,
    `LIGHTING: ${LIGHTING_SPEC}.`,
    `SOURCE PHOTO: ${SOURCE_QUALITY_SPEC}.`,
    `SKIN: ${SKIN_SPEC}.`,
    `FACE LIGHT: ${FACE_DIMENSION_SPEC}.`,
    `SHARPNESS: ${SHARPNESS_SPEC}.`,
    `PROPORTION: ${PROPORTION_SPEC}.`,
    'Keep everyone from IMAGE 1 and do not add any other person, model or face. With two or more people, each has a complete, separate body with natural anatomy (exactly two arms and two hands each), side by side or slightly overlapping; never merge bodies, share limbs or add hands.',
    'Do not paste or cut out the original photo: re-render bodies, clothes and hands naturally inside the scene, in front of any railings or props, never cut off by them.',
    tmpl.style === 'postcard'
      ? `Composition: portrait 2:3 travel postcard photo, the customer(s) in the foreground ${tmpl.framing || 'framed from the waist up'}, large and centred, ${tmpl.pose || 'smiling naturally at the camera like a real holiday photo'}, with the landmark or festival scene clearly visible behind them; the name text never covers a face.${tmpl.camera ? ` Camera: ${tmpl.camera}.` : ''}`
      : 'Composition: portrait 2:3 movie poster, the customer(s) framed waist-up, large and centred, filling the space from just below the title down to the bottom text line, facing the camera.',
    tmpl.style === 'postcard' && `Scene: the customer(s) are ${tmpl.setting}.`,
    `Wardrobe and styling: for women ${tmpl.female}; for men ${tmpl.male}; choose per person (with the poster hairstyle above). Scene lighting: ${tmpl.lighting}.`,
    QUALITY_RULES
  ].filter(Boolean).join(' ');
}

// Optional second pass: pull the faces back towards the real photo without touching the poster
export function refinePrompt(tmpl: ScenePrompt, { hasCrop }: { hasCrop: boolean }): string {
  return [
    'IMAGE 1 is a generated movie poster. IMAGE 2 is the original photo of the real customer(s)' + (hasCrop ? ', and IMAGE 3 is a close-up crop of IMAGE 2.' : '.'),
    `Edit IMAGE 1 only where needed so that every FACE is a 100% exact photographic likeness of the matching person in IMAGE 2 (match people by their left-to-right position): ${IDENTITY_SPEC}.`,
    `Hair: keep the poster hairstyle of IMAGE 1 exactly as it is (${hairFor(tmpl)}); never bring back the hairstyle, hair length, fringe or hair colour from IMAGE 2.`,
    'Keep the pose, body, clothes, hands, background, composition, colours and ALL text of IMAGE 1 exactly the same. Do not add or remove anyone.',
    `Blend the corrected faces seamlessly: ${LIGHTING_SPEC}; keep ${PROPORTION_SPEC}.`,
    `Source photo: ${SOURCE_QUALITY_SPEC}. Skin: ${SKIN_SPEC}. Face light: ${FACE_DIMENSION_SPEC}. Sharpness: ${SHARPNESS_SPEC}.`,
    QUALITY_RULES
  ].join(' ');
}
