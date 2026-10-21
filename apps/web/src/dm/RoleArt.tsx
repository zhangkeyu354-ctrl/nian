import React from "react";
import { roles } from "../../../../packages/dying-message/src/index.ts";

/** Artwork is restored from reference; all lettering stays native and sharp. */
export function RoleArt({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  const role = roles.find((r) => r.roleId === id);
  if (!role) return null;
  const cell = role.imageAtlasCell.index;
  const openEye =
    ["private-detective", "soulmate", "wonder-dog", "mastermind"].includes(
      id,
    ) || role.canKill;
  return (
    <span
      className={"dm-printed-card " + className}
      data-role-id={id}
      data-faction={role.faction}
      role="img"
      aria-label={role.name + "身份牌"}
    >
      <span
        className="dm-restored-portrait"
        style={{
          backgroundImage: `url(${role.imageResource})`,
          backgroundPosition: `${(cell % 3) * 50}% ${Math.floor(cell / 3) * 100}%`,
        }}
      />
      <span
        className="dm-card-eye"
        data-closed={!openEye || undefined}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          {openEye ? (
            <>
              <path d="M2 10Q16 -4 30 10Q16 24 2 10Z" />
              <ellipse cx="16" cy="10" rx="5" ry="7" />
              <path d="M16 1V-2M6 4L3 0M26 4L29 0" />
            </>
          ) : (
            <path d="M2 5Q16 19 30 5M6 9L3 14M13 12L12 18M21 12L22 18M27 9L30 14" />
          )}
        </svg>
      </span>
      <span className="dm-card-name">{role.name}</span>
      <span className="dm-card-faction">
        {role.faction === "GUILTY" ? "有罪阵营" : "无罪阵营"}
      </span>
      <strong className="dm-card-english">{role.englishName}</strong>
    </span>
  );
}
