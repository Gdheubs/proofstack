// The exam pages: the attempt itself and the camera and microphone check.
// They show no header, footer or bottom tabs, and they are the only pages
// whose response allows the camera and microphone (see next.config.ts).
export const EXAM_TAKE_PATH = "/assessments/take";
export const EXAM_DEVICE_CHECK_PATH = "/assessments/device-check";

// Must match the value next.config.ts sends for the exam pages; a test
// compares the two. Self only: no embedded frame ever gets either device.
export const EXAM_PERMISSIONS_POLICY =
  "camera=(self), microphone=(self), fullscreen=(self), geolocation=(), payment=(), display-capture=()";

export function isExamPath(path: string | null | undefined): boolean {
  return (
    path === EXAM_DEVICE_CHECK_PATH ||
    path === EXAM_TAKE_PATH ||
    !!path?.startsWith(`${EXAM_TAKE_PATH}/`)
  );
}
