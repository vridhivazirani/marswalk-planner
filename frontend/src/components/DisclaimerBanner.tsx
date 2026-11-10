/**
 * Non-certification disclaimer. Must stay visible on every page (see AGENTS.md).
 * The text mirrors backend/app/core/disclaimer.py.
 */
export const DISCLAIMER =
  'Marswalk Planner is a research and education prototype. It is not NASA software, ' +
  'is not endorsed or certified by NASA, and must not be used for operational ' +
  'astronaut-safety or mission decisions.'

export function DisclaimerBanner() {
  return (
    <div className="disclaimer" role="note" aria-label="Disclaimer">
      <strong>Disclaimer:</strong> {DISCLAIMER}
    </div>
  )
}

