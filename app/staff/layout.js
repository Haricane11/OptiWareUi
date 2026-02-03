'use client';

import { WmsProvider } from '../../context/WmsContext';

export default function StaffLayout({ children }) {
  return (
    <WmsProvider>
      {children}
    </WmsProvider>
  );
}
