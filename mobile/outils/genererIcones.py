# -*- coding: utf-8 -*-
"""
genererIcones.py — Fabrique les icônes de l'application « Correction en salle ».

Le dépôt ne contient aucun fichier image : ces PNG sont produits ici plutôt que
dessinés à la main, pour qu'on puisse les refaire à l'identique si la palette
change. Seul Pillow est requis (déjà présent dans .venv).

    python mobile/outils/genererIcones.py

Motif : trois carrés de repérage de QRCode et une coche, en blanc sur le bleu de
suiviAtelier.html. Monochrome à dessein — une icône de lanceur est lue à 48 px,
où toute nuance disparaît.

Trois usages, trois cadrages :
  - « any »           : carré aux coins arrondis, le lanceur l'affiche tel quel ;
  - « maskable »      : fond à fond perdu, motif confiné au carré inscrit dans le
                        cercle de sécurité (80 % du côté), sinon Android le rogne ;
  - apple-touch-icon  : opaque et à coins vifs, iOS appliquant les siens.
"""

from pathlib import Path
from PIL import Image, ImageDraw

BLEU  = (27, 79, 114, 255)      # #1b4f72 — le bleu de l'outil
BLANC = (255, 255, 255, 255)

SS = 4                          # suréchantillonnage, puis réduction : bords lisses

DOSSIER = Path(__file__).resolve().parent.parent / 'icones'


def _motif(d, origine, cote):
    """Dessine le motif dans un carré de côté `cote`, sur une grille de 100 unités."""
    x0, y0 = origine
    u = cote / 100.0
    X = lambda v: x0 + v * u
    Y = lambda v: y0 + v * u

    # Les trois carrés de repérage : c'est à eux qu'on reconnaît un QRCode.
    epaisseur = max(1, round(7 * u))
    for cx, cy in ((0, 0), (62, 0), (0, 62)):
        d.rectangle([X(cx), Y(cy), X(cx + 38), Y(cy + 38)],
                    outline=BLANC, width=epaisseur)
        d.rectangle([X(cx + 13), Y(cy + 13), X(cx + 25), Y(cy + 25)], fill=BLANC)

    # La coche, dans le quadrant que les repères laissent libre : « corrigé ».
    trait = max(1, round(11 * u))
    sommets = [(X(56), Y(79)), (X(68), Y(91)), (X(98), Y(57))]
    d.line(sommets, fill=BLANC, width=trait, joint='curve')
    for x, y in sommets:      # bouts ronds — PIL ne les arrondit pas tout seul
        r = trait / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=BLANC)


def fabriquer(nom, taille, arrondi, insertion, opaque=False):
    """
    arrondi   : rayon des coins, en fraction du côté (0 = coins vifs)
    insertion : marge autour du motif, en fraction du côté
    """
    grand = taille * SS
    img = Image.new('RGBA', (grand, grand), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if arrondi:
        d.rounded_rectangle([0, 0, grand - 1, grand - 1],
                            radius=round(arrondi * grand), fill=BLEU)
    else:
        d.rectangle([0, 0, grand - 1, grand - 1], fill=BLEU)

    marge = insertion * grand
    _motif(d, (marge, marge), grand - 2 * marge)

    img = img.resize((taille, taille), Image.LANCZOS)
    if opaque:
        fond = Image.new('RGB', (taille, taille), BLEU[:3])
        fond.paste(img, mask=img.split()[3])
        img = fond

    chemin = DOSSIER / nom
    img.save(chemin, 'PNG', optimize=True)
    print(f'{chemin.name:28} {taille}x{taille}  {chemin.stat().st_size / 1024:.1f} Ko')


if __name__ == '__main__':
    DOSSIER.mkdir(parents=True, exist_ok=True)
    fabriquer('icone-192.png',           192, arrondi=0.22, insertion=0.20)
    fabriquer('icone-512.png',           512, arrondi=0.22, insertion=0.20)
    # Le cercle de sécurité fait 80 % du côté ; le carré qui s'y inscrit, 56 %.
    fabriquer('icone-maskable-512.png',  512, arrondi=0,    insertion=0.22)
    fabriquer('apple-touch-icon-180.png', 180, arrondi=0,   insertion=0.20, opaque=True)
