import type { Metadata } from "next";
import { HomeView } from "@/features/home/home-view";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <HomeView />;
}
