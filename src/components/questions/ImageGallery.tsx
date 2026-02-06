"use client";

import { useState } from "react";
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
            className="overflow-hidden rounded-lg border border-border-color hover:opacity-90 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`첨부 이미지 ${idx + 1}`}
              className="w-full h-32 sm:h-40 object-cover cursor-pointer"
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
