import Workbench from "./workbench";

export default function Home() {
  const googleDriveClientId = process.env.GOOGLE_DRIVE_CLIENT_ID
    || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
    || "";
  return <Workbench configuredGoogleDriveClientId={googleDriveClientId} />;
}
