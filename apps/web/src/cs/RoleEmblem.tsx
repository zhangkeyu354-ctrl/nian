type Role = "forensic" | "investigator" | "killer" | "accomplice" | "witness";
import type { ReactElement } from "react";

const paths: Record<Role, ReactElement> = {
  forensic: <><circle cx="27" cy="27" r="13" /><path d="M37 37l13 13" strokeWidth="5" /><path d="M21 27h12M27 21v12" strokeWidth="2" /></>,
  investigator: <><path d="M32 8l20 7v15c0 13-9 21-20 26C21 51 12 43 12 30V15z" /><path d="M32 22l3.5 7 7.5 1-5.5 5 1.5 7.5-7-3.8-7 3.8 1.5-7.5-5.5-5 7.5-1z" fill="currentColor" stroke="none" /></>,
  killer: <><path d="M20 44c-6-6-6-18 2-25s20-6 25 2" /><path d="M24 40c-3-5-2-12 3-16s13-3 15 3" /><path d="M29 36c-1-4 0-7 3-8s6 1 6 5c0 5-2 9-5 12" /><path d="M44 30c1 7-1 14-6 20M18 50c3-2 5-4 6-7" /></>,
  accomplice: <><rect x="10" y="24" width="24" height="16" rx="8" /><rect x="30" y="24" width="24" height="16" rx="8" /></>,
  witness: <><path d="M8 32c7-11 15-16 24-16s17 5 24 16c-7 11-15 16-24 16S15 43 8 32z" /><circle cx="32" cy="32" r="7" fill="currentColor" /></>,
};

export const roleCamp: Record<Role, string> = { forensic: "好人阵营 · 主持", investigator: "好人阵营", witness: "好人阵营", killer: "坏人阵营", accomplice: "坏人阵营" };
export const roleDuty: Record<Role, string> = {
  forensic: "知道真相，只能用提示标记引导大家",
  investigator: "读懂提示，指认关键证物和作案方式",
  witness: "认得两名坏人，但别暴露自己",
  killer: "隐藏身份，把怀疑引向别人",
  accomplice: "掩护同伴，扰乱调查",
};

export default function RoleEmblem({ role }: { role: Role }) {
  return <svg className="cs-emblem" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{paths[role]}</svg>;
}
