import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GameSandbox } from "./GameSandbox";
import { Host } from "./Host";
import { Controller } from "./Controller";
import { StartScreen } from "./StartScreen";
import { WebGLGate } from "./WebGLGate";
import "./styles.css";

// No StrictMode: its double-invoked effects would spin up the Babylon engine
// (and, on /host, rooms) twice. Revisit once setup is idempotent.
//
// Routes:
//   /       start screen for picking host / join / solo play
//   /game   single-player saved Studio level
//   /host   laptop shared scene; loads saved Studio level/settings
//   /join   phone pilot controller
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <WebGLGate>
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/game" element={<GameSandbox />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Controller />} />
      </Routes>
    </WebGLGate>
  </BrowserRouter>
);
