"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageLightbox } from "./ImageLightbox";

interface ImageGalleryProps {
  imageUrls: string[];
}

export function ImageGallery({ imageUrls }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (imageUrls.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        {imageUrls.map((url, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setLightboxIndex(idx)}
            className="relative overflow-hidden rounded-lg border border-border-color hover:opacity-90 transition-opacity h-32 sm:h-40"
          >
            <Image
              src={url}
              alt={`첨부 이미지 ${idx + 1}`}
              fill
              className="object-cover cursor-pointer"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          imageUrls={imageUrls}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}
