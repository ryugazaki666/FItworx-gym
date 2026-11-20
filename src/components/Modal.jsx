import { createContext, useContext, useState } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [content, setContent] = useState(null);

  const openModal = (node) => setContent(node);
  const closeModal = () => setContent(null);

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      <div
        className={`fixed inset-0 bg-[rgba(10,17,30,0.5)] z-[150] p-5 items-center justify-center ${
          content ? "flex" : "hidden"
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="app-modal bg-white rounded-2xl max-w-[480px] w-full p-[26px] shadow-lg overflow-y-auto">{content}</div>
      </div>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}

export function ModalActions({ children }) {
  return <div className="flex gap-2.5 mt-[22px] justify-end">{children}</div>;
}
