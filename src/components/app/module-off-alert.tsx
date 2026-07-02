import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Standard fallback for every module seam that is switched off, mirroring how the
// engine behaves (UI_BUILD_PLAN §1, §6.4). One copy, everywhere.
export function ModuleOffAlert({
  module,
  detail,
}: {
  /** Human name of the module, e.g. "SOP Library" or "Training". */
  module: string;
  /** Optional extra sentence about what this seam does when on. */
  detail?: string;
}) {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertTitle>{module} is switched off for this organization</AlertTitle>
      <AlertDescription>
        {detail ?? "This capability is controlled at the platform level. Nothing here is available until it is enabled."}
      </AlertDescription>
    </Alert>
  );
}
