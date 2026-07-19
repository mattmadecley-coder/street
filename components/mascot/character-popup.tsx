"use client";

import Image from "next/image";
import styles from "./character-popup.module.css";

export type CharacterPopupPosition = "cart" | "left" | "right";

export type CharacterPopupRequest = {
  position?: CharacterPopupPosition;
  message: string;
  duration?: number;
  characterImage?: string;
};

export const CHARACTER_POPUP_EVENT = "street:character-popup";

export function showCharacterPopup(request: CharacterPopupRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CharacterPopupRequest>(CHARACTER_POPUP_EVENT, { detail: request }));
}

export function CharacterPopup({
  position = "right",
  message,
  characterImage = "/images/street-character.png",
  visible,
}: CharacterPopupRequest & { visible: boolean }) {
  return (
    <div className={`${styles.popup} ${styles[position]} ${visible ? styles.visible : ""}`} data-position={position}>
      <div className={styles.characterWrap} aria-hidden="true">
        <Image
          className={styles.character}
          src={characterImage}
          alt=""
          width={480}
          height={720}
          sizes={position === "cart" ? "(max-width: 840px) 105px, 150px" : "(max-width: 840px) 120px, 170px"}
          priority={false}
        />
      </div>
      <div className={styles.bubble} role="status" aria-live="polite">{message}</div>
    </div>
  );
}
