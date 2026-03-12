"use client";

import { useContext } from "react";
import { ProfileContext } from "@/components/providers/ProfileProvider";

export function useProfiles() {
  return useContext(ProfileContext);
}
