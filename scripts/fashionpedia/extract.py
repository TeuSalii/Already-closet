"""Turns Fashionpedia photos into outfits the app's rules can check.

Test 3 in docs/outfit-pipeline.md. Each Fashionpedia photo shows real clothes
someone wore, with every garment outlined and labelled. For each photo with
one complete outfit (top or dress, bottom or dress, shoes), this writes the
garments as the app would tag them:

- type: from Fashionpedia's category, made finer with its "nickname"
  attribute where it has one (a "top, t-shirt, sweatshirt" with the nickname
  "polo (shirt)" becomes a polo).
- colours: read from the pixels inside the garment's outline, each pixel
  matched to the nearest of the app's 20 colour words (the same shades as
  src/shared/outfit/colors.ts, read from that file). Fashionpedia has no
  colour labels. A solid garment keeps only its main colour, since shading
  alone would give it two or three.
- pattern, neckline, suede: from Fashionpedia's attributes.

What Fashionpedia doesn't say (formality, season, style, metal, mostly
material) is left out, and the rules that need it are not judged.

Run from the project folder, after downloading (see the doc):
    python3 -I scripts/fashionpedia/extract.py
Needs numpy and Pillow. Writes data/fashionpedia/outfits.json.
"""

import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "fashionpedia"
ANNOTATIONS = DATA / "download" / "instances_attributes_val2020.json"
IMAGES_ZIP = DATA / "download" / "val_test2020.zip"
OUT = DATA / "outfits.json"

SAMPLE_PIXELS = 6000  # per garment: plenty to find its colours, and fast
MIN_PIXELS = 400  # smaller outlines are too few pixels to trust a colour
EXTRA_COLOUR_SHARE = 0.2  # a second or third colour needs this share of the pixels


def colour_table():
    """The 20 colour words and their shades, from colors.ts, so both agree."""
    source = (ROOT / "src" / "shared" / "outfit" / "colors.ts").read_text()
    block = source[source.index("const HEX") : source.index("};", source.index("const HEX"))]
    pairs = re.findall(r'"?([a-z-]+)"?:\s*"(#[0-9a-f]{6})"', block)
    if len(pairs) != 20:
        sys.exit(f"Expected 20 colours in colors.ts, found {len(pairs)}")
    return [name for name, _ in pairs], np.array([to_lab(hex_rgb(h)) for _, h in pairs])


def hex_rgb(value):
    return np.array([int(value[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)


def to_lab(rgb):
    """sRGB (0-255, shape (..., 3)) to CIE LAB, D65: the same formula as colors.ts."""
    c = np.asarray(rgb, dtype=float) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    x = (c @ [0.4124, 0.3576, 0.1805]) / 0.95047
    y = c @ [0.2126, 0.7152, 0.0722]
    z = (c @ [0.0193, 0.1192, 0.9505]) / 1.08883
    e = (6 / 29) ** 3
    f = lambda t: np.where(t > e, np.cbrt(t), t / (3 * (6 / 29) ** 2) + 4 / 29)
    fx, fy, fz = f(x), f(y), f(z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def rle_counts(counts):
    """COCO's compressed RLE string to run lengths (pycocotools' rleFrString)."""
    if isinstance(counts, list):
        return counts
    result, p = [], 0
    while p < len(counts):
        x, k, more = 0, 0, True
        while more:
            c = ord(counts[p]) - 48
            x |= (c & 0x1F) << (5 * k)
            more = bool(c & 0x20)
            p += 1
            k += 1
            if not more and (c & 0x10):
                x |= -1 << (5 * k)
        if len(result) > 2:
            x += result[-2]
        result.append(x)
    return result


def mask_of(segmentation, height, width):
    if isinstance(segmentation, dict):
        flat = np.zeros(height * width, dtype=bool)
        position, value = 0, False
        for run in rle_counts(segmentation["counts"]):
            flat[position : position + run] = value
            position += run
            value = not value
        return flat.reshape((width, height)).T  # COCO stores masks column by column
    canvas = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(canvas)
    for polygon in segmentation:
        if len(polygon) >= 6:
            draw.polygon(polygon, fill=1)
    return np.array(canvas, dtype=bool)


# Fashionpedia category → the app's type. None: not something the app tags.
CATEGORY_TYPE = {
    "shirt, blouse": "shirt",
    "top, t-shirt, sweatshirt": "top",  # made finer by nickname below
    "sweater": "sweater",
    "cardigan": "cardigan",
    "jacket": "jacket",
    "vest": "vest",
    "pants": "pants",
    "shorts": "shorts",
    "skirt": "skirt",
    "coat": "coat",
    "dress": "dress",
    "jumpsuit": "jumpsuit",
    "cape": "coat",
    "hat": "hat",
    "tie": "tie",
    "watch": "watch",
    "belt": "belt",
    "tights, stockings": "tights",
    "sock": "socks",
    "shoe": "shoes",
    "bag, wallet": "bag",
    "scarf": "scarf",
}

NICKNAME_TYPE = {
    "polo (shirt)": "polo",
    "hoodie": "hoodie",
    "classic (t-shirt)": "t-shirt",
    "ringer (t-shirt)": "t-shirt",
    "raglan (t-shirt)": "t-shirt",
    "undershirt": "t-shirt",
    "henley (shirt)": "t-shirt",
    "tank (top)": "tank-top",
    "camisole": "tank-top",
    "blazer": "blazer",
    "tuxedo (jacket)": "blazer",
    "jeans": "jeans",
}

PATTERN = {
    "plain (pattern)": "solid",
    "check": "plaid",
    "houndstooth (pattern)": "checkered",
    "stripe": "striped",
    "floral": "floral",
    "plant": "floral",
    "dot": "polka-dot",
    "camouflage": "camouflage",
    "geometric": "geometric",
    "argyle": "geometric",
    "chevron": "geometric",
    "herringbone (pattern)": "geometric",
    "fair isle": "geometric",
    "abstract": "graphic",
    "cartoon": "graphic",
    "letters, numbers": "graphic",
    "paisley": "graphic",
    "toile de jouy": "graphic",
}

NECKLINE = {
    "v-neck": "v-neck",
    "crew (neck)": "crew",
    "round (neck)": "crew",
    "turtle (neck)": "turtleneck",
    "high (neck)": "turtleneck",
}

UPPER = {"shirt", "top", "t-shirt", "polo", "hoodie", "tank-top", "sweater", "cardigan", "jacket", "blazer", "vest", "coat"}
BOTTOM = {"pants", "jeans", "shorts", "skirt"}
WHOLE = {"dress", "jumpsuit"}
METALLIC = {"gold", "silver"}


def main():
    names, shades = colour_table()
    cloth = np.array([n not in METALLIC for n in names])
    data = json.loads(ANNOTATIONS.read_text())
    category = {c["id"]: c["name"] for c in data["categories"]}
    attribute = {a["id"]: (a["supercategory"], a["name"]) for a in data["attributes"]}
    by_image = defaultdict(list)
    for annotation in data["annotations"]:
        by_image[annotation["image_id"]].append(annotation)

    archive = zipfile.ZipFile(IMAGES_ZIP)
    member = {Path(n).name: n for n in archive.namelist() if n.endswith(".jpg")}
    skipped = Counter()
    outfits = []

    for image in data["images"]:
        garments = []
        for annotation in by_image.get(image["id"], []):
            app_type = CATEGORY_TYPE.get(category[annotation["category_id"]])
            if app_type is None:
                continue
            attrs = [attribute[a] for a in annotation["attribute_ids"]]
            for kind, name in attrs:
                if kind == "nickname" and name in NICKNAME_TYPE:
                    app_type = NICKNAME_TYPE[name]
            garments.append((app_type, annotation, attrs))

        types = Counter(t for t, _, _ in garments)
        bottoms = sum(types[t] for t in BOTTOM)
        wholes = sum(types[t] for t in WHOLE)
        upper = sum(types[t] for t in UPPER)
        # One person, one complete outfit: more than one bottom, dress or
        # pair of shoes means more than one person in the photo.
        if types["shoes"] == 0 or (bottoms == 0 and wholes == 0) or (upper == 0 and wholes == 0):
            skipped["not a complete outfit"] += 1
            continue
        if bottoms > 1 or wholes > 1 or types["shoes"] > 2 or any(types[t] > 1 for t in UPPER):
            skipped["more than one person, or unclear"] += 1
            continue

        photo = np.array(Image.open(BytesIO(archive.read(member[image["file_name"]]))).convert("RGB"))
        height, width = photo.shape[:2]
        rng = np.random.default_rng(image["id"])
        pieces, shoe_mask, shoe_attrs = [], None, []

        def colours_of(mask, metallic_ok):
            pixels = photo[mask]
            if len(pixels) < MIN_PIXELS:
                return None
            if len(pixels) > SAMPLE_PIXELS:
                pixels = pixels[rng.choice(len(pixels), SAMPLE_PIXELS, replace=False)]
            distance = np.linalg.norm(to_lab(pixels)[:, None, :] - shades[None, :, :], axis=2)
            if not metallic_ok:
                distance[:, ~cloth] = np.inf
            share = np.bincount(distance.argmin(axis=1), minlength=len(names)) / len(pixels)
            order = [i for i in np.argsort(-share) if share[i] > 0]
            chosen = [order[0]] + [i for i in order[1:3] if share[i] >= EXTRA_COLOUR_SHARE]
            return [names[i] for i in chosen], round(float(share[order[0]]), 2)

        def piece(app_type, mask, attrs, ids):
            found = colours_of(mask, metallic_ok=app_type in {"watch", "belt"})
            if found is None:
                return None
            colours, main_share = found
            pattern = next((PATTERN[n] for k, n in attrs if k == "textile pattern" and n in PATTERN), None)
            if pattern is None and any(k == "animal" for k, _ in attrs):
                pattern = "animal-print"
            material = "suede" if ("leather", "suede") in attrs else ("leather" if any(k == "leather" for k, _ in attrs) else "unknown")
            neckline = next((NECKLINE[n] for k, n in attrs if k == "neckline type" and n in NECKLINE), None)
            # No shoe types in Fashionpedia: white shoes count as white
            # sneakers, by far the most common white shoe.
            if app_type == "shoes" and colours[0] == "white":
                app_type = "sneakers"
            # Shading splits one colour into several (jeans read as gray and
            # navy). A solid garment has one colour; only a patterned one
            # keeps its second and third.
            if (pattern or "solid") == "solid":
                colours = colours[:1]
            return {
                "id": f"{image['id']}:{'+'.join(ids)}",
                "type": app_type,
                "colors": colours,
                "mainShare": main_share,
                "pattern": pattern or "solid",
                "material": material,
                **({"neckline": neckline or "other"} if app_type == "sweater" else {}),
            }

        for app_type, annotation, attrs in garments:
            mask = mask_of(annotation["segmentation"], height, width)
            if app_type == "shoes":  # two shoes, one pair
                shoe_mask = mask if shoe_mask is None else (shoe_mask | mask)
                shoe_attrs += attrs
                continue
            made = piece(app_type, mask, attrs, [str(annotation["id"])])
            if made:
                pieces.append(made)
        shoes = piece("shoes", shoe_mask, shoe_attrs, ["shoes"])
        if shoes is None or not any(p["type"] in BOTTOM | WHOLE for p in pieces):
            skipped["garments too small to read"] += 1
            continue
        pieces.append(shoes)
        outfits.append({"image": image["file_name"], "imageId": image["id"], "pieces": pieces})

    OUT.write_text(json.dumps(outfits, indent=1))
    print(f"{len(outfits)} outfits written to {OUT.relative_to(ROOT)}, from {len(data['images'])} photos")
    for reason, count in skipped.most_common():
        print(f"  skipped {count}: {reason}")


if __name__ == "__main__":
    main()
