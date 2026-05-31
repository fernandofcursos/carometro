import { createRoot } from "react-dom/client";
import { setCredentials } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

setCredentials("include");

createRoot(document.getElementById("root")!).render(<App />);
