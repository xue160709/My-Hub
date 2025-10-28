import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pages/popup/index.css';
import '@assets/styles/tailwind.css';
import AddBookmarkForm from '@src/pages/newtab/components/AddBookmarkForm';

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Popup root element");
  const root = createRoot(rootContainer);
  root.render(<div className="p-8">
    <AddBookmarkForm />
  </div>);
}

init();
