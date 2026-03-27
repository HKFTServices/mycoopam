import { createRoot } from "react-dom/client";
import { IonApp, setupIonicReact } from "@ionic/react";
import App from "./App.tsx";
import "./index.css";
import "@ionic/react/css/core.css";

setupIonicReact();

createRoot(document.getElementById("root")!).render(
  <IonApp>
    <App />
  </IonApp>
);
