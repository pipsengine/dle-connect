import HardwareInventoryPage from "./hardware-inventory";

export const metadata = {
  title: "Hardware Inventory",
};

export default function Page() {
  return (
    <main className="p-8">
      <HardwareInventoryPage />
    </main>
  );
}
