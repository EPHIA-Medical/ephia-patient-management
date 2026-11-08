import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import UpdateNotice from "./components/ui/UpdateNotice.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        {/* Outside App so it also shows on the login and loading screens */}
        <UpdateNotice />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
