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
const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const accountPhoto = document.getElementById("accountPhoto");
const accountCreated = document.getElementById("accountCreated");
const accountSignOut = document.getElementById("accountSignOut");
const accountStatus = document.getElementById("accountStatus");

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
        authLink.href = "account.html";
        authLink.setAttribute("aria-label", "Open your PDFMaster account.");
        authLink.classList.add("pm-auth-profile");
        const profileImage = document.createElement("img");
        profileImage.className = "pm-auth-avatar";
        profileImage.alt = "";
        profileImage.referrerPolicy = "no-referrer";
        const profileInitials = (user.displayName || user.email || "U")
          .split(/\\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
        const profileFallback = document.createElement("span");
        profileFallback.className = "pm-auth-avatar-fallback";
        profileFallback.textContent = profileInitials;
        const profileLabel = document.createElement("span");
        profileLabel.textContent = user.displayName ? user.displayName.split(" ")[0] : "My Account";
        authLink.replaceChildren(profileFallback, profileLabel);
        if (user.photoURL) {
          profileImage.src = user.photoURL;
          profileImage.onload = () => {
            profileFallback.hidden = true;
            authLink.insertBefore(profileImage, profileLabel);
          };
          profileImage.onerror = () => {
            profileImage.remove();
            profileFallback.hidden = false;
          };
        }

      } else {
        authLink.textContent = "Sign in";
        authLink.href = "login.html";
        document.getElementById("pmSignOutButton")?.remove();
      }
    }
    if (accountName) {
      if (!user) { window.location.replace("login.html"); return; }
      accountName.textContent = user.displayName || "PDFMaster user";
      accountEmail.textContent = user.email || "Email not available";
      accountCreated.textContent = user.metadata?.creationTime
        ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : "Not available";
      const accountFallback = document.getElementById("accountPhotoFallback");
      if (accountPhoto && user.photoURL) {
        accountPhoto.referrerPolicy = "no-referrer";
        accountPhoto.onload = () => {
          accountPhoto.hidden = false;
          if (accountFallback) accountFallback.hidden = true;
        };
        accountPhoto.onerror = () => {
          accountPhoto.hidden = true;
          if (accountFallback) accountFallback.hidden = false;
        };
        accountPhoto.src = user.photoURL;
      } else if (accountFallback) {
        accountFallback.hidden = false;
      }
      if (accountFallback) {
        accountFallback.textContent = (user.displayName || user.email || "U")
          .split(/\\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
      }
      if (accountStatus) accountStatus.textContent = "Your Google account is connected.";
    }
    if (accountSignOut) accountSignOut.onclick = async () => {
      accountSignOut.disabled = true;
      try { await signOut(auth); window.location.replace("index.html"); }
      catch (error) {
        console.error("PDFMaster sign-out error:", error);
        accountSignOut.disabled = false;
        if (accountStatus) accountStatus.textContent = "Could not sign out. Please try again.";
      }
    };
    if (loginButton && user) {
      showStatus("Already signed in as " + (user.email || "your Google account") + ".");
      loginButton.textContent = "Continue to PDFMaster";
      loginButton.onclick = () => window.location.replace("index.html");
    }
  });
}
