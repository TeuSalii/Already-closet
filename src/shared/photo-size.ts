// How a photo is shrunk before it goes to the model: on the phone
// (cut-picture.ts) and on the dev test page (app/dev/test+api.ts).

// Big enough for the model and the screens, small enough to cut quickly.
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.8;
