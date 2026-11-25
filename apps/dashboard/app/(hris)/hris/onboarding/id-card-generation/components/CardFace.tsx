"use client";

import { useEffect, useMemo, useState } from 'react';
import { backSvg, frontSvg, svgDataUrl, type CardTemplate, type Face } from '../lib/card-template';
import { fullName, type Employee } from '../lib/employees';
import { loadPhoto } from '../lib/export';

/**
 * One side of the ID card, rendered from the same SVG used for export (fills its container's width).
 */
export function CardFace({ face, employee, template }: { face: Face; employee: Employee; template: CardTemplate }) {
  const [photo, setPhoto] = useState<{ url?: string; data?: string }>({});

  useEffect(() => {
    if (face !== 'front' || !employee.photoUrl) return;
    let active = true;
    loadPhoto(employee.photoUrl).then((data) => active && setPhoto({ url: employee.photoUrl, data }));
    return () => {
      active = false;
    };
  }, [face, employee.photoUrl]);

  const photoData = photo.url === employee.photoUrl ? photo.data : undefined;
  const src = useMemo(
    () => svgDataUrl(face === 'front' ? frontSvg(employee, photoData) : backSvg(employee, template)),
    [face, employee, template, photoData]
  );

  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URL
    <img src={src} alt={`${face === 'front' ? 'Front' : 'Back'} of ${fullName(employee)}'s ID card`} className="block w-full h-auto" draggable={false} />
  );
}
