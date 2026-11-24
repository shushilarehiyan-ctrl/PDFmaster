import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const configReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain &&
  firebaseConfig.projectId && firebaseConfig.appId
);

const loginButton = document.getElementById("googleSignInButton");
const statusNode = document.getElementById("authStatus");
const authLink = document.getElementById("pmAuthLink");

function showStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.state = isError ? "error" : "info";
}

if (!configReady) {
  if (loginButton) loginButton.disabled = true;
  showStatus("Google Login setup is not finished yet. Add your Firebase web-app config to firebase-config.js, then enable Google in Firebase Authentication.", true);
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  setPersistence(auth, browserLocalPersistence).catch(error => {
    console.error("PDFMaster auth persistence error:", error);
  });

  if (loginButton) {
    loginButton.disabled = false;
    loginButton.addEventListener("click", async () => {
      loginButton.disabled = true;
      showStatus("Opening secure Google sign-in…");
      try {
        await signInWithPopup(auth, provider);
        window.location.replace("index.html");
      } catch (error) {
        console.error("PDFMaster Google sign-in error:", error);
        const messages = {
          "auth/popup-closed-by-user": "Sign-in was cancelled. You can try again.",
          "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
          "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again."
        };
        showStatus(messages[error.code] || "Google sign-in could not be completed. Please check your Firebase settings and try again.", true);
      } finally {
        loginButton.disabled = false;
      }
    });
  }

  onAuthStateChanged(auth, user => {
    if (authLink) {
      if (user) {
        authLink.textContent = user.displayName ? user.displayName.split(" ")[0] : "My Account";
        authLink.href = "login.html";
        authLink.setAttribute("aria-label", "Signed in. Open account options.");
        let signOutButton = document.getElementById("pmSignOutButton");
        if (!signOutButton) {
          signOutButton = document.createElement("button");
          signOutButton.type = "button";
          signOutButton.id = "pmSignOutButton";
          signOutButton.className = "pm-auth-signout";
          signOutButton.textContent = "Sign out";
          authLink.insertAdjacentElement("afterend", signOutButton);
        }
        signOutButton.onclick = async () => {
          try { await signOut(auth); window.location.reload(); }
          catch (error) { console.error("PDFMaster sign-out error:", error); }
        };
      } else {
        authLink.textContent = "Sign in";
        authLink.href = "login.html";
        document.getElementById("pmSignOutButton")?.remove();
      }
    }
    if (loginButton && user) {
      showStatus("Already signed in as " + (user.email || "your Google account") + ".");
      loginButton.textContent = "Continue to PDFMaster";
      loginButton.onclick = () => window.location.replace("index.html");
    }
  });
}
