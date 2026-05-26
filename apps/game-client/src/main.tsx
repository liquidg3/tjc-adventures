import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GameSandbox } from "./GameSandbox";
import { Host } from "./Host";
import { Controller } from "./Controller";
import "./styles.css";

// No StrictMode: its double-invoked effects would spin up the Babylon engine
// (and, on /host, rooms) twice. Revisit once setup is idempotent.
//
// Routes:
//   /       graphics sandbox (the ship) — current focus
//   /host   the laptop "table" lobby (M0 spine, parked)
//   /join   phone controller (M0 spine, parked)
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<GameSandbox />} />
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Controller />} />
    </Routes>
  </BrowserRouter>
);
