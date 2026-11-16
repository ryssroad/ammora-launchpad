"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useGiwa } from "@/components/giwa-wallet";

const ADMIN_KEY = "giwamoon.admin";

export function useOwnerMode() {
  const { address } = useGiwa();
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin")) window.localStorage.setItem(ADMIN_KEY, "1");
    setRemembered(window.localStorage.getItem(ADMIN_KEY) === "1");
  }, []);

  const configured = process.env.NEXT_PUBLIC_OWNER_ADDRESS?.trim() ?? "";
  const walletIsOwner = Boolean(
    address && isAddress(configured) && address.toLowerCase() === configured.toLowerCase(),
  );
  return remembered || walletIsOwner;
}
