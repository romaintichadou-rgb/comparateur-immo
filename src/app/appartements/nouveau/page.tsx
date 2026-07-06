import { Suspense } from "react";
import AddApartmentFlow from "@/components/AddApartmentFlow";

export default function NouveauApartementPage() {
  return (
    <Suspense>
      <AddApartmentFlow />
    </Suspense>
  );
}
