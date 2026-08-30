import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { SUPABASE_URL, SUPABASE_ANON_KEY, pgv } from "./lib/supabase/client";
import { supabaseSignIn, supabaseSignUp, supabaseSignOut, supabaseResetPassword, supabaseRefreshToken, supabaseGetUser } from "./lib/supabase/auth";
import { supabaseFetchProfiles, supabaseUpdateProfile } from "./lib/supabase/profiles";
import { supabaseFetchInvoices, supabaseCreateInvoice, supabaseUpdateInvoice, supabaseDeleteInvoice } from "./lib/supabase/invoices";
import { supabaseFetchDocuments, supabaseCreateDocument, supabaseUpdateDocument, supabaseDeleteDocument, supabaseUpdateDocumentBehandlung } from "./lib/supabase/documents";
import { supabaseFetchBehandlungen, supabaseCreateBehandlung, supabaseUpdateBehandlung, supabaseDeleteBehandlung } from "./lib/supabase/behandlungen";
import { supabaseFetchVouchers, supabaseFetchVoucherByCode, supabaseCreateVoucher, supabaseUpdateVoucher, supabaseDeleteVoucher } from "./lib/supabase/vouchers";
import { migrateInvoicesToDocuments } from "./lib/migration";
import { supabaseFetchPatients, supabaseDeletePatient } from "./lib/supabase/patients";
import { supabaseFetchActivityLog, supabaseCreateActivityLog } from "./lib/supabase/activityLog";
import { trackEvent } from "./lib/analytics";
import {
  MEK_SESSION_KEY, bufToBase64, base64ToBuf, derivePDK,
  generateMEK, generateSalt, generateRecoveryKey,
  wrapMEK, unwrapMEK, encryptData, decryptData,
  exportMEKToBase64, importMEKFromBase64,
  storeMEKInSession, loadMEKFromSession, clearMEKFromSession,
  computePatientHash, getPatientIdentifier
} from "./lib/crypto";
import { DEFAULT_PRACTICE, AUTO_LOGOUT_MS, ZUSCHLAEGE, BOTOX_GOA_ITEMS, PUNKTWERT, SACHKOSTEN_INFO, ICD10_CODES, PRIORITY_COUNTRIES, OTHER_COUNTRIES } from "./constants";
import { parseDE, evalAmount, fmt, fmtDate, buildLineItems, calcWeightedForGesamt, calcGoaBetrag, calcGesamt, parsePlzOrt, combinePlzOrt, nextInvoiceNumber, toDE, flashOrtField, lookupPlz } from "./utils/helpers";
import { subscribeToast, showToast } from "./utils/toast";
import { generateVoucherCode, createVoucherObject, computeStatus, redeemBlockReason, applyRedemption, restoreRedemption } from "./utils/vouchers";
import { LoginScreen, SignUpScreen, ResetPasswordScreen, SetNewPasswordScreen } from "./components/auth/AuthScreens";
import ImpressumPage from "./components/legal/Impressum";
import DatenschutzPage from "./components/legal/Datenschutz";
import AGBPage from "./components/legal/AGB";
import PreviewScaler from "./components/ui/PreviewScaler";
import { spawnConfetti } from "./components/ui/ConfettiBurst";
import PraeparatAutocomplete from "./components/ui/PraeparatAutocomplete";
import InfoTooltip from "./components/ui/InfoTooltip";
import ConsentFormPreview, { ConsentFormView } from "./components/consent/ConsentFormComponents";
import { CONSENT_TEMPLATES } from "./components/consent/consentTemplates";
import SignaturePad, { SignatureModal } from "./components/consent/SignaturePad";
import PinGate from "./components/consent/PinGate";
import TreatmentMap from "./components/treatment/TreatmentMap";
import MobileScaledPreview from "./components/treatment/MobileScaledPreview";
import SettingsPanel from "./components/settings/SettingsPanel";
import InvoicePreview from "./components/invoice/InvoicePreview";
import HonorarvereinbarungPreview from "./components/invoice/HonorarvereinbarungPreview";
import VoucherListView from "./components/voucher/VoucherListView";
import VoucherCreateForm from "./components/voucher/VoucherCreateForm";
import VoucherPreview from "./components/voucher/VoucherPreview";
import VoucherReceiptPreview from "./components/voucher/VoucherReceiptPreview";
import VoucherRedeemField from "./components/voucher/VoucherRedeemField";
import PatientListView from "./components/patients/PatientListView";
import ExpandableCard from "./components/patients/ExpandableCard";
import TreatmentDocPreview from "./components/patients/TreatmentDocumentPreview";
import PatientDetailView from "./components/patients/PatientDetailView";
import InvoiceListView from "./components/invoices/InvoiceListView";
import NotFoundPage from "./components/ui/NotFoundPage";

let currentMEK = null;

// ═══════════════════ Main App ═══════════════════

export default function EphiaInvoice() {
  // ─── Auth State ───
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authPage, setAuthPage] = useState("login"); // "login" | "signup" | "reset" | "set_new_password"
  const [recoveryAccessToken, setRecoveryAccessToken] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authSuccessEmail, setAuthSuccessEmail] = useState("");

  // ─── Main App State ───
  const [practice, setPractice] = useState(DEFAULT_PRACTICE);
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(null); // null | "welcome" | "patient"
  const [showVerdienst, setShowVerdienst] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  // Derive current section from pathname
  const isPatientDetail = pathname.startsWith("/patients/") && pathname.split("/")[2] && pathname.split("/")[2] !== "neu";
  const isCreatePage = pathname === "/erstellen";
  const isListPage = pathname === "/rechnungen" || pathname === "/honorarvereinbarungen" || pathname === "/aufklaerung" || pathname === "/behandlungen";
  const isPreviewPage = (pathname.startsWith("/rechnungen/") || pathname.startsWith("/honorarvereinbarungen/") || pathname.startsWith("/aufklaerung/") || pathname.startsWith("/behandlungen/")) && pathname.split("/")[2] && pathname.split("/")[2] !== "neu";
  const isConsentPage = pathname === "/aufklaerung/neu";
  const isVoucherListPage = pathname === "/gutscheine";
  const isVoucherCreatePage = pathname === "/gutscheine/erstellen";
  const isVoucherPreviewPage = pathname.startsWith("/gutscheine/") && pathname.split("/")[2] && pathname.split("/")[2] !== "erstellen";
  const isKnownRoute = pathname === "/" || pathname === "/patients" || pathname === "/erstellen"
    || pathname === "/agb" || pathname === "/impressum" || pathname === "/datenschutz"
    || isPatientDetail || isCreatePage || isListPage || isPreviewPage || isConsentPage
    || isVoucherListPage || isVoucherCreatePage || isVoucherPreviewPage;
  const activeDocId = isPreviewPage ? pathname.split("/")[2] : null;
  const activeVoucherId = isVoucherPreviewPage ? pathname.split("/")[2] : null;
  const activePatientId = isPatientDetail ? pathname.split("/")[2] : null;

  const [patient, setPatient] = useState({ vorname: "", nachname: "", email: "", phone: "", address1: "", address2: "", country: "Deutschland" });
  const [invoiceMeta, setInvoiceMeta] = useState({
    nummer: "1",
    ort: "",
    datum: new Date().toISOString().slice(0, 10),
    zahlungsfrist: 14,
  });

  // Indication type & Diagnose (medical vs aesthetic)
  const [showIndicationModal, setShowIndicationModal] = useState(false);
  const [indicationType, setIndicationType] = useState("aesthetic"); // "aesthetic" | "medical"
  const [diagnose, setDiagnose] = useState("");

  // Autofill Behandlungsort from practice city
  React.useEffect(() => {
    if (practice.city && !invoiceMeta.ort) {
      setInvoiceMeta((prev) => ({ ...prev, ort: practice.city }));
    }
  }, [practice.city]);

  // Treatment inputs
  const [praeparat, setPraeparat] = useState("");
  const [einheit, setEinheit] = useState("SE");
  const [mlStr, setMlStr] = useState("1");
  const [preisProMlStr, setPreisProMlStr] = useState("");
  // Whole-ampoule billing (Verwurf): charge the full ampoule price regardless of injected amount
  const [ganzeAmpulle, setGanzeAmpulle] = useState(false);
  const [ampullenpreisStr, setAmpullenpreisStr] = useState("");

  // Zuschläge
  const [selectedZuschlaege, setSelectedZuschlaege] = useState([]);

  // Sachkosten
  const [sachkosten, setSachkosten] = useState([]);
  const [nextSkId, setNextSkId] = useState(1);

  // Treatment documentation (optional)
  const [treatmentMarkers, setTreatmentMarkers] = useState([]);
  const [treatmentFacePhoto, setTreatmentFacePhoto] = useState("");

  // Sync treatment marker amounts → Menge field
  React.useEffect(() => {
    if (treatmentMarkers.length === 0) return;
    const total = treatmentMarkers.reduce((sum, m) => sum + evalAmount(m.amount), 0);
    if (total > 0) setMlStr(total % 1 === 0 ? String(total) : total.toFixed(2).replace(".", ","));
  }, [treatmentMarkers]);

  // Desired total amount (inkl. MwSt.) → back-compute weighted Steigerungssätze
  const [wunschGesamtStr, setWunschGesamtStr] = useState("");
  const [useBeratungLang, setUseBeratungLang] = useState(false);
  const [begruendung, setBegruendung] = useState("");
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [attachTreatmentPdf, setAttachTreatmentPdf] = useState(false);
  const [hvOnlyMode, setHvOnlyMode] = useState(false);
  const [fromHvId, setFromHvId] = useState(null); // ID of imported HV
  const [hvBaseGesamt, setHvBaseGesamt] = useState(null); // original HV Gesamtbetrag (brutto)
  const [hvBaseProductCost, setHvBaseProductCost] = useState(null); // original HV product cost (ml * preisProMl)
  const [hvBaseSachkosten, setHvBaseSachkosten] = useState(0); // original HV sachkosten (always 0 for HVs)
  const [isSaving, setIsSaving] = useState(false);

  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [amendingId, setAmendingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteVoucher, setConfirmDeleteVoucher] = useState(null);
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showConsentDoctorSign, setShowConsentDoctorSign] = useState(false);
  const [showHvDoctorSign, setShowHvDoctorSign] = useState(false);
  const [consentPatient, setConsentPatient] = useState(null); // patient for active consent flow
  const [consentTemplate, setConsentTemplate] = useState(null); // active consent template
  const [consentWarningPatient, setConsentWarningPatient] = useState(null); // patient pending consent warning confirmation
  const [consentHandback, setConsentHandback] = useState(null); // completed consent entry waiting for PIN-gated device handback
  const [consentHandbackPin, setConsentHandbackPin] = useState(false); // PIN gate visible on handback screen
  const pendingDocBehIdRef = useRef(null); // Behandlung ID to link next created doc to
  const [invoices, setInvoices] = useState([]);
  const [behandlungen, setBehandlungen] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [viewingVoucher, setViewingVoucher] = useState(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherPreviewTab, setVoucherPreviewTab] = useState("karte"); // "karte" | "beleg"
  const [appliedVoucher, setAppliedVoucher] = useState(null); // decrypted voucher row applied to the invoice being created
  const [voucherLookupError, setVoucherLookupError] = useState("");
  const [voucherLooking, setVoucherLooking] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const EMPTY_PATIENT = { vorname: "", nachname: "", email: "", phone: "", address1: "", address2: "", country: "Deutschland", geburtsdatum: "", geschlecht: "", groesse: "", gewicht: "" };
  const [newPatientData, setNewPatientData] = useState(EMPTY_PATIENT);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [createForPatient, setCreateForPatient] = useState(null); // patient object when creating invoice from patient profile
  const [createSource, setCreateSource] = useState("patientDetail"); // "patientDetail" or "list"
  const [patientCreateModal, setPatientCreateModal] = useState(null); // null | "rechnung" | "hv" | "aufklaerung"

  const [validationErrors, setValidationErrors] = useState({});
  const [previewTab, setPreviewTab] = useState("rechnung"); // "rechnung" | "honorar"
  const [saveToast, setSaveToast] = useState("");  // empty = hidden, string = message
  const [toastIsError, setToastIsError] = useState(false); // red error variant of the toast
  // Show an app-native error toast (never a browser alert).
  const showErrorToast = (msg) => showToast(msg, { error: true });
  // Render any toast raised from anywhere in the app (incl. child components).
  useEffect(() => subscribeToast(({ message, error = false, duration = 4000 }) => {
    setToastIsError(!!error);
    setSaveToast(message);
    setTimeout(() => { setSaveToast(""); setToastIsError(false); }, duration);
  }), []);
  const docsMigrated = useRef(false); // true after docs_migration_version >= 1

  // ─── Sync selectedPatient from URL when navigating directly to /patients/:id ───
  useEffect(() => {
    if (activePatientId && patients.length > 0 && dataLoaded) {
      const found = patients.find((p) => p.id === activePatientId);
      if (found && (!selectedPatient || selectedPatient.id !== activePatientId)) {
        const d = (typeof found.data === "object" && found.data) ? found.data : {};
        setSelectedPatient({
          vorname: d.vorname || "",
          nachname: d.nachname || "",
          email: d.email || "",
          id: found.id,
          _raw: found,
        });
      }
    }
  }, [activePatientId, patients, dataLoaded]);

  // ─── Sync viewingInvoice from URL when navigating directly to a document URL ───
  useEffect(() => {
    if (activeDocId && invoices.length > 0 && dataLoaded) {
      const found = invoices.find((i) => i._supabaseId === activeDocId || String(i.id) === activeDocId);
      if (found && (!viewingInvoice || viewingInvoice._supabaseId !== activeDocId)) {
        setViewingInvoice(found);
        // Restore the correct preview tab from the URL so a direct link / page reload
        // shows the right document (and the download button targets the right element).
        if (pathname.startsWith("/honorarvereinbarungen/")) setPreviewTab("honorar");
        else if (pathname.startsWith("/behandlungen/")) setPreviewTab("behandlung");
        else if (pathname.startsWith("/rechnungen/")) setPreviewTab("rechnung");
      }
    }
  }, [activeDocId, invoices, dataLoaded]);

  // Redirect away from /aufklaerung/neu if consent state is missing
  // Skip during consent completion (consentCompletingRef prevents race with navigateToPreview)
  const consentCompletingRef = useRef(false);
  useEffect(() => {
    if (isConsentPage && (!consentPatient || !consentTemplate) && !consentCompletingRef.current) {
      navigate(selectedPatient ? `/patients/${selectedPatient.id || selectedPatient._raw?.id}` : "/patients");
    }
  }, [isConsentPage, consentPatient, consentTemplate]);

  // Kiosk PIN is only active with at least 4 digits (see settings hint)
  const kioskPin = (practice.kioskPin || "").length >= 4 ? practice.kioskPin : "";

  // Kiosk lock: while the full-page consent flow is active, force the route back to
  // /aufklaerung/neu so the browser back button can't drop patients into the app.
  const consentKioskActive = !!(consentPatient && consentTemplate && patientCreateModal !== "aufklaerung");
  useEffect(() => {
    if (consentKioskActive && !isConsentPage && !consentCompletingRef.current) {
      navigate("/aufklaerung/neu");
    }
  }, [consentKioskActive, isConsentPage]);

  // ─── Navigate to the right preview URL based on document type ───
  const navigateToPreview = (inv) => {
    setViewingInvoice(inv);
    const docId = inv._supabaseId || String(inv.id);
    if (inv._consentForm || inv._docType === "aufklaerung") {
      navigate(`/aufklaerung/${docId}`);
    } else if (inv._hvOnly || inv._docType === "hv") {
      navigate(`/honorarvereinbarungen/${docId}`);
    } else if (inv._treatmentDocOnly || inv._standalone || inv._docType === "behandlungsdoku") {
      navigate(`/behandlungen/${docId}`);
    } else {
      navigate(`/rechnungen/${docId}`);
    }
  };

  // ─── Force patients page when no patients exist ───
  useEffect(() => {
    if (dataLoaded && patients.length === 0 && pathname !== "/patients") {
      navigate("/patients", { replace: true });
    }
  }, [dataLoaded, patients.length, pathname]);

  // ─── Scroll to top on page change ───
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // ─── Check session on mount (restore MEK from sessionStorage) ───
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Detect password recovery redirect from Supabase
        // Case 1: Hash fragment flow (#access_token=...&type=recovery)
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
          const params = new URLSearchParams(hash.substring(1));
          const token = params.get("access_token");
          if (token) {
            setRecoveryAccessToken(token);
            setAuthPage("set_new_password");
            window.history.replaceState(null, "", window.location.pathname);
            setAuthLoading(false);
            return;
          }
        }
        // Case 2: PKCE flow (?code=...) — exchange code for session
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get("code");
        if (authCode) {
          try {
            const codeVerifier = sessionStorage.getItem("ephia_pkce_verifier") || "";
            sessionStorage.removeItem("ephia_pkce_verifier");
            const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
              body: JSON.stringify({ auth_code: authCode, code_verifier: codeVerifier }),
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                setRecoveryAccessToken(tokenData.access_token);
                setAuthPage("set_new_password");
                window.history.replaceState(null, "", window.location.pathname);
                setAuthLoading(false);
                return;
              }
            } else {
              const errData = await tokenRes.json();
              console.error("PKCE exchange failed:", errData);
              setAuthError("Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an.");
            }
          } catch (e) {
            console.error("Failed to exchange recovery code:", e);
            setAuthError("Fehler beim Verarbeiten des Reset-Links.");
          }
          window.history.replaceState(null, "", window.location.pathname);
        }
        // Case 3: Error/error_description in hash (Supabase error redirect)
        if (hash && hash.includes("error")) {
          const params = new URLSearchParams(hash.substring(1));
          const errorDesc = params.get("error_description");
          if (errorDesc) {
            setAuthError(decodeURIComponent(errorDesc.replace(/\+/g, " ")));
          }
          window.history.replaceState(null, "", window.location.pathname);
        }

        const stored = localStorage.getItem("ephia_session");
        if (stored) {
          const sess = JSON.parse(stored);
          // Try to refresh token
          try {
            const refreshed = await supabaseRefreshToken(sess.refresh_token);
            const newSess = {
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token || sess.refresh_token,
              user: refreshed.user,
            };
            localStorage.setItem("ephia_session", JSON.stringify(newSess));
            setSession(newSess);
            setUser(newSess.user);

            // Restore MEK from sessionStorage (survives page reload within same tab)
            const mekB64 = loadMEKFromSession();
            if (mekB64) {
              try {
                currentMEK = await importMEKFromBase64(mekB64);
              } catch (e) {
                console.error("Failed to restore MEK from session:", e);
                clearMEKFromSession();
              }
            }

            // If MEK couldn't be restored, check if user has encryption set up
            // If so, force re-login so password can unlock the MEK
            if (!currentMEK) {
              try {
                const profiles = await supabaseFetchProfiles(newSess.access_token, newSess.user.id);
                const profile = profiles.length > 0 ? profiles[0] : null;
                if (profile && profile.encrypted_mek) {
                  console.log("[E2EE] MEK lost from session, forcing re-login to unlock encryption");
                  localStorage.removeItem("ephia_session");
                  clearMEKFromSession();
                  setSession(null);
                  setUser(null);
                  setAuthLoading(false);
                  return; // Exit early — user must re-enter password
                }
              } catch (e) {
                console.error("Failed to check encryption profile:", e);
              }
            }

            await loadUserData(newSess.access_token, newSess.user.id, newSess.user.email);
          } catch (err) {
            console.error("Token refresh failed:", err);
            localStorage.removeItem("ephia_session");
            clearMEKFromSession();
          }
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        setAuthLoading(false);
      }
    };
    checkSession();
  }, []);

  // ─── Auto-logout after inactivity ───
  const autoLogoutTimerRef = useRef(null);
  const handleSignOutRef = useRef(null);
  const hvUploadRef = useRef(null);

  useEffect(() => {
    if (!session || !practice.autoLogoutEnabled) {
      if (autoLogoutTimerRef.current) { clearTimeout(autoLogoutTimerRef.current); autoLogoutTimerRef.current = null; }
      return;
    }
    const resetTimer = () => {
      if (autoLogoutTimerRef.current) clearTimeout(autoLogoutTimerRef.current);
      autoLogoutTimerRef.current = setTimeout(() => {
        if (handleSignOutRef.current) handleSignOutRef.current();
      }, AUTO_LOGOUT_MS);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (autoLogoutTimerRef.current) clearTimeout(autoLogoutTimerRef.current);
    };
  }, [session, practice.autoLogoutEnabled]);

  // ─── Load user data from Supabase (with E2EE decryption) ───
  const loadUserData = async (accessToken, userId, userEmail) => {
    try {
      // Load practice data
      const profiles = await supabaseFetchProfiles(accessToken, userId);
      if (profiles.length > 0 && profiles[0].practice_data) {
        const practiceData = profiles[0].practice_data;
        // practice_data is kept as plaintext (doctor's own business data, not patient data)
        if (typeof practiceData === "object" && practiceData !== null) {
          setPractice(practiceData);
          setIsFirstTimeUser(false);
        } else {
          if (userEmail) setPractice((prev) => ({ ...prev, email: userEmail }));
          setIsFirstTimeUser(true);
          setOnboardingStep("welcome");
        }
      } else {
        // First-time user: pre-fill email and show onboarding welcome
        if (userEmail) setPractice((prev) => ({ ...prev, email: userEmail }));
        setIsFirstTimeUser(true);
        setOnboardingStep("welcome");
      }

      // Check migration version to determine data source
      const profile = profiles.length > 0 ? profiles[0] : null;
      const migVersion = profile?.docs_migration_version || 0;
      docsMigrated.current = migVersion >= 1;

      let loadedInvoices = [];
      if (docsMigrated.current) {
        // NEW PATH: Load from documents + behandlungen tables
        const docRecords = await supabaseFetchDocuments(accessToken, userId);
        for (const rec of docRecords) {
          let docData = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof docData === "string") {
            try { docData = await decryptData(docData, rec.iv, currentMEK); }
            catch (e) { console.error("Failed to decrypt document:", rec.id, e); continue; }
          }
          loadedInvoices.push({ ...docData, _supabaseId: rec.id, _docType: rec.doc_type, _behandlungId: rec.behandlung_id, _patientId: rec.patient_id, _createdAt: rec.created_at });
        }

        // Load behandlungen
        const behRecords = await supabaseFetchBehandlungen(accessToken, userId);
        const loadedBeh = [];
        for (const rec of behRecords) {
          let behData = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof behData === "string") {
            try { behData = await decryptData(behData, rec.iv, currentMEK); }
            catch (e) { console.error("Failed to decrypt behandlung:", rec.id, e); continue; }
          }
          loadedBeh.push({ ...behData, _id: rec.id, _patientId: rec.patient_id, _createdAt: rec.created_at });
        }
        setBehandlungen(loadedBeh);

        // Load activity log
        try {
          const logRecords = await supabaseFetchActivityLog(accessToken, userId);
          const loadedLog = [];
          for (const rec of logRecords) {
            let logData = rec.data;
            if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof logData === "string") {
              try { logData = await decryptData(logData, rec.iv, currentMEK); } catch (e) { continue; }
            }
            loadedLog.push({ ...logData, _id: rec.id, _patientId: rec.patient_id, entityType: rec.entity_type, entityId: rec.entity_id, actionType: rec.action_type, _createdAt: rec.created_at });
          }
          setActivityLog(loadedLog);
        } catch (e) { console.error("Failed to load activity log:", e); }
      } else {
        // LEGACY PATH: Load from invoices table
        const invoiceRecords = await supabaseFetchInvoices(accessToken, userId);
        for (const rec of invoiceRecords) {
          let invoiceData = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof invoiceData === "string") {
            try { invoiceData = await decryptData(invoiceData, rec.iv, currentMEK); }
            catch (e) { console.error("Failed to decrypt invoice:", rec.id, e); continue; }
          }
          if (currentMEK && invoiceData.encrypted_patient && invoiceData.patient_iv) {
            try {
              invoiceData.patient = await decryptData(invoiceData.encrypted_patient, invoiceData.patient_iv, currentMEK);
              delete invoiceData.encrypted_patient;
              delete invoiceData.patient_iv;
            } catch (e) {
              console.error("Failed to decrypt patient in invoice:", rec.id, e);
              invoiceData.patient = { vorname: "[verschlüsselt]", nachname: "", email: "", phone: "", address1: "", address2: "", country: "" };
            }
          }
          loadedInvoices.push({ ...invoiceData, _supabaseId: rec.id, _createdAt: rec.created_at });
        }
      }
      setInvoices(loadedInvoices);

      // Load patients (decrypt if needed)
      try {
        const patientRecords = await supabaseFetchPatients(accessToken, userId);
        const decryptedPatients = [];
        for (const rec of patientRecords) {
          let patientData = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof patientData === "string") {
            try {
              patientData = await decryptData(patientData, rec.iv, currentMEK);
            } catch (e) {
              console.error("Failed to decrypt patient:", rec.id, e);
              continue;
            }
          }
          decryptedPatients.push({ ...rec, data: patientData });
        }
        setPatients(decryptedPatients);

        // Repair invoices with missing patient data (caused by earlier status-update bug)
        let repaired = false;
        const isMissing = (inv) => !inv.patient || (!inv.patient.vorname && !inv.patient.nachname && !inv.patient.name);
        // Build a map: patient email -> patient data from intact invoices
        const emailToPatient = {};
        for (const inv of loadedInvoices) {
          if (!isMissing(inv) && inv.patient.email) {
            emailToPatient[inv.patient.email.toLowerCase()] = inv.patient;
          }
        }
        // Also build from patient table
        const patientsByEmail = {};
        for (const p of decryptedPatients) {
          const pd = p.data || {};
          if (pd.email) patientsByEmail[pd.email.toLowerCase()] = pd;
        }
        // If there's only one patient, use that for all orphaned invoices
        const allPatientEmails = Object.keys(patientsByEmail);
        const singlePatient = allPatientEmails.length === 1 ? patientsByEmail[allPatientEmails[0]] : null;

        for (const inv of loadedInvoices) {
          if (isMissing(inv)) {
            // Try matching by email if partially available
            let match = null;
            if (inv.patient && inv.patient.email) {
              const em = inv.patient.email.toLowerCase();
              match = emailToPatient[em] || patientsByEmail[em];
            }
            // If no match and only one patient exists, use that
            if (!match && singlePatient) {
              match = singlePatient;
            }
            if (match) {
              inv.patient = { vorname: match.vorname || "", nachname: match.nachname || "", email: match.email || "", phone: match.phone || "", address1: match.address1 || "", address2: match.address2 || "", country: match.country || "Deutschland" };
              repaired = true;
              // Persist repair to Supabase (E2EE: fetch, decrypt, modify, re-encrypt)
              if (inv._supabaseId && currentMEK) {
                try {
                  const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${pgv(inv._supabaseId)}&select=data,iv,encryption_version`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } });
                  const rows = await fetchRes.json();
                  if (rows.length > 0) {
                    let stored = rows[0].data;
                    if (rows[0].encryption_version >= 1 && rows[0].iv && typeof stored === "string") stored = await decryptData(stored, rows[0].iv, currentMEK);
                    if (stored.encrypted_patient && stored.patient_iv) { stored.patient = await decryptData(stored.encrypted_patient, stored.patient_iv, currentMEK); delete stored.encrypted_patient; delete stored.patient_iv; }
                    stored.patient = inv.patient;
                    const enc = await encryptData(stored, currentMEK);
                    const repairTable = docsMigrated.current ? "documents" : "invoices";
                    await fetch(`${SUPABASE_URL}/rest/v1/${repairTable}?id=eq.${pgv(inv._supabaseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" }, body: JSON.stringify({ data: enc.ciphertext, iv: enc.iv, encryption_version: 2 }) });
                  }
                } catch (e) { console.error("Failed to repair invoice patient:", inv._supabaseId, e); }
              }
            } else {
              // No match found — set placeholder so UI doesn't crash. User can fix via "Ändern".
              inv.patient = { vorname: "[Patient:in", nachname: "unbekannt]", email: "", phone: "", address1: "", address2: "", country: "Deutschland" };
              repaired = true;
              console.warn("[REPAIR] No match for invoice", inv.invoiceMeta?.nummer, "- using placeholder. Please amend this invoice to assign the correct patient.");
            }
          }
        }
        if (repaired) setInvoices([...loadedInvoices]);
      } catch (err) {
        console.error("Failed to load patients:", err);
      }

      // Load vouchers (encrypted blob + plaintext code/status)
      try {
        const voucherRecords = await supabaseFetchVouchers(accessToken, userId);
        const loadedVouchers = [];
        for (const rec of voucherRecords) {
          let vData = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof vData === "string") {
            try { vData = await decryptData(vData, rec.iv, currentMEK); }
            catch (e) { console.error("Failed to decrypt voucher:", rec.id, e); continue; }
          }
          loadedVouchers.push({ ...vData, id: rec.id, code: rec.code, _status: rec.status, _createdAt: rec.created_at });
        }
        setVouchers(loadedVouchers);
      } catch (e) { console.error("Failed to load vouchers:", e); }

      setDataLoaded(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error("Failed to load user data:", err);
      setDataLoaded(true);
      window.scrollTo(0, 0);
    }
  };

  // ─── E2EE: Initialize encryption for new user ───
  const initializeEncryption = async (accessToken, userId, password) => {
    console.log("[E2EE] Initializing encryption for user", userId);
    const mek = await generateMEK();
    const salt = generateSalt();
    const pdk = await derivePDK(password, salt);
    const { encrypted: encryptedMek, iv: mekIv } = await wrapMEK(mek, pdk);
    // Recovery key: random AES key stored server-side for email-based recovery
    const rk = await generateRecoveryKey();
    const { encrypted: recoveryWrappedMek, iv: recoveryIv } = await wrapMEK(mek, rk);
    const rkRaw = await crypto.subtle.exportKey("raw", rk);
    const recoveryKeyBase64 = bufToBase64(rkRaw);
    // Store all crypto params in profile
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${pgv(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" },
      body: JSON.stringify({
        encrypted_mek: encryptedMek, mek_salt: salt, mek_iv: mekIv,
        mek_params: { iterations: 100000, hash: "SHA-256" },
        recovery_wrapped_mek: recoveryWrappedMek, recovery_iv: recoveryIv,
        recovery_key: recoveryKeyBase64, encryption_version: 1,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[E2EE] Failed to store encryption keys:", res.status, err);
      throw new Error("Failed to initialize encryption: " + err);
    }
    console.log("[E2EE] Encryption keys stored successfully");
    currentMEK = mek;
    const mekB64 = await exportMEKToBase64(mek);
    storeMEKInSession(mekB64);
  };

  // ─── E2EE: Unlock MEK from password ───
  const unlockMEK = async (password, profile, accessToken) => {
    const pdk = await derivePDK(password, profile.mek_salt, profile.mek_params?.iterations || 100000);
    try {
      const mek = await unwrapMEK(profile.encrypted_mek, profile.mek_iv, pdk);
      currentMEK = mek;
      const mekB64 = await exportMEKToBase64(mek);
      storeMEKInSession(mekB64);
    } catch (e) {
      // MEK unwrap failed — likely password was reset. Try recovery key.
      console.warn("MEK unwrap with password failed, trying recovery key...", e);
      if (profile.recovery_key && profile.recovery_wrapped_mek && profile.recovery_iv) {
        const rkRaw = base64ToBuf(profile.recovery_key);
        const rk = await crypto.subtle.importKey("raw", rkRaw, { name: "AES-GCM", length: 256 }, false, ["unwrapKey"]);
        const mek = await unwrapMEK(profile.recovery_wrapped_mek, profile.recovery_iv, rk);
        currentMEK = mek;
        // Re-wrap MEK with new password
        const newSalt = generateSalt();
        const newPdk = await derivePDK(password, newSalt);
        const { encrypted: newEncMek, iv: newMekIv } = await wrapMEK(mek, newPdk);
        // Also generate a new recovery key
        const newRk = await generateRecoveryKey();
        const { encrypted: newRecWrapped, iv: newRecIv } = await wrapMEK(mek, newRk);
        const newRkRaw = await crypto.subtle.exportKey("raw", newRk);
        // Update profile with new wrapping
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${pgv(profile.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" },
          body: JSON.stringify({
            encrypted_mek: newEncMek, mek_salt: newSalt, mek_iv: newMekIv,
            recovery_wrapped_mek: newRecWrapped, recovery_iv: newRecIv,
            recovery_key: bufToBase64(newRkRaw),
          }),
        });
        const mekB64 = await exportMEKToBase64(mek);
        storeMEKInSession(mekB64);
      } else {
        throw new Error("Entschlüsselung fehlgeschlagen. Bitte kontaktiere den Support.");
      }
    }
  };

  // ─── E2EE: Migrate data to full encryption (version 2) ───
  // Runs on every login; encrypts entire data object for any record not yet at version 2
  const migrateToEncrypted = async (accessToken, userId) => {
    if (!currentMEK) return;
    console.log("[E2EE] Checking for data needing migration...");
    let migratedInvoices = 0;

    // Migrate invoices: entire data object should be encrypted (version 2)
    const invoiceRecords = await supabaseFetchInvoices(accessToken, userId);
    for (const rec of invoiceRecords) {
      // Already at version 2 — skip
      if (rec.encryption_version >= 2) continue;

      let invoiceData = rec.data;

      // Case 1: Old fully encrypted (version 1, iv set, data is string) — decrypt first
      if (rec.encryption_version >= 1 && rec.iv && typeof invoiceData === "string") {
        try {
          console.log("[E2EE] Decrypting v1 invoice:", rec.id);
          invoiceData = await decryptData(invoiceData, rec.iv, currentMEK);
        } catch (e) {
          console.error("[E2EE] Failed to decrypt invoice:", rec.id, e);
          continue;
        }
      }

      // Case 2: Patient-only encryption (version 0) — decrypt patient field first
      if (typeof invoiceData === "object" && invoiceData?.encrypted_patient) {
        try {
          invoiceData.patient = await decryptData(invoiceData.encrypted_patient, invoiceData.patient_iv, currentMEK);
          delete invoiceData.encrypted_patient;
          delete invoiceData.patient_iv;
        } catch (e) {
          console.error("[E2EE] Failed to decrypt patient in invoice:", rec.id, e);
          continue;
        }
      }

      // Now encrypt entire data object as version 2
      if (typeof invoiceData === "object") {
        try {
          const { ciphertext, iv } = await encryptData(invoiceData, currentMEK);
          const res = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${pgv(rec.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" },
            body: JSON.stringify({ data: ciphertext, iv, encryption_version: 2 }),
          });
          if (!res.ok) console.error("[E2EE] Failed to migrate invoice:", rec.id, await res.text());
          else migratedInvoices++;
        } catch (e) {
          console.error("[E2EE] Failed to encrypt invoice for v2:", rec.id, e);
        }
      }
    }
    if (migratedInvoices > 0) console.log("[E2EE] Invoices migrated:", migratedInvoices);

    // Migrate patients: encrypt data, hash email, clear plaintext email
    let migratedPatients = 0;
    const patientRecords = await supabaseFetchPatients(accessToken, userId);
    for (const rec of patientRecords) {
      if (rec.encryption_version >= 1) continue; // already encrypted
      const patientEmail = rec.email || rec.data?.email || "";
      const patientHash = await computePatientHash(patientEmail, currentMEK);
      const { ciphertext, iv } = await encryptData(rec.data, currentMEK);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${pgv(rec.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Prefer": "return=representation" },
        body: JSON.stringify({ data: ciphertext, iv, patient_hash: patientHash, email: null, encryption_version: 1 }),
      });
      if (!res.ok) console.error("[E2EE] Failed to migrate patient:", rec.id, await res.text());
      else migratedPatients++;
    }
    if (migratedPatients > 0) console.log("[E2EE] Patients migrated:", migratedPatients);
    if (migratedInvoices === 0 && migratedPatients === 0) console.log("[E2EE] All data already migrated");
  };

  // ─── Auth functions ───
  const handleSignIn = async (email, password) => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await supabaseSignIn(email, password);
      const sess = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      };
      localStorage.setItem("ephia_session", JSON.stringify(sess));
      setSession(sess);
      setUser(sess.user);
      trackEvent("login", {}, sess.access_token);

      // E2EE: Check if user has encryption set up
      console.log("[E2EE] Checking encryption status...");
      const profiles = await supabaseFetchProfiles(data.access_token, data.user.id);
      const profile = profiles.length > 0 ? profiles[0] : null;
      console.log("[E2EE] Profile found:", !!profile, "encrypted_mek:", !!profile?.encrypted_mek);
      if (profile && profile.encrypted_mek) {
        // Existing encrypted user: unlock MEK
        console.log("[E2EE] Unlocking existing MEK...");
        await unlockMEK(password, profile, data.access_token);
        console.log("[E2EE] MEK unlocked successfully");
      } else {
        // New or pre-E2EE user: initialize encryption
        console.log("[E2EE] No encryption found, initializing...");
        await initializeEncryption(data.access_token, data.user.id, password);
      }

      // Always run migration to ensure all data is properly encrypted
      await migrateToEncrypted(data.access_token, data.user.id);

      // Migrate invoices → documents table (idempotent, safe to re-run)
      await migrateInvoicesToDocuments(data.access_token, data.user.id, currentMEK);

      await loadUserData(data.access_token, data.user.id, data.user.email);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (email, password) => {
    setAuthError("");
    setAuthSuccess(false);
    setAuthLoading(true);
    try {
      await supabaseSignUp(email, password);
      trackEvent("account_created");
      setAuthSuccessEmail(email);
      setAuthSuccess(true);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (email) => {
    setAuthError("");
    setAuthSuccess(false);
    if (!email || !email.includes("@")) {
      setAuthError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }
    setAuthLoading(true);
    try {
      await supabaseResetPassword(email.trim().toLowerCase());
      setAuthSuccess(true);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (session) {
      try {
        await supabaseSignOut(session.access_token);
      } catch (err) {
        console.error("Logout error:", err);
      }
    }
    localStorage.removeItem("ephia_session");
    currentMEK = null;
    clearMEKFromSession();
    setSession(null);
    setUser(null);
    setInvoices([]);
    setBehandlungen([]);
    setActivityLog([]);
    setPatients([]);
    setPractice(DEFAULT_PRACTICE);
    setDataLoaded(false);
    docsMigrated.current = false;
    setAuthPage("login");
    setAuthError("");
  };
  handleSignOutRef.current = handleSignOut;

  const ml = parseDE(mlStr);
  const preisProMl = parseDE(preisProMlStr);
  const ampullenpreis = parseDE(ampullenpreisStr);

  const inputCls = (field) =>
    `w-full border rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 ${
      validationErrors[field]
        ? "border-red-400 bg-red-50 focus:ring-red-400"
        : "border-[#DFE3EB] focus:ring-blue-400"
    }`;
  const clearError = (field) => {
    if (validationErrors[field]) setValidationErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  // Compute live preview
  const isKlein = practice.kleinunternehmer;
  const isAusland = patient.country && patient.country !== "Deutschland";
  const isMedical = indicationType === "medical";
  const noMwst = isKlein || isAusland || isMedical;
  // HV cost deviation: auto-adjust Gesamtbetrag when costs exceed HV base
  const currentProductCost = ganzeAmpulle ? Math.round(ampullenpreis * 100) / 100 : Math.round(ml * preisProMl * 100) / 100;
  const currentSachkostenTotal = (sachkosten || []).reduce((sum, sk) => sum + parseDE(sk.betragStr), 0);
  const hvProductDelta = hvBaseGesamt != null && hvBaseProductCost != null ? Math.round((currentProductCost - hvBaseProductCost) * 100) / 100 : 0;
  const hvSachkostenDelta = hvBaseGesamt != null ? Math.round((currentSachkostenTotal - hvBaseSachkosten) * 100) / 100 : 0;
  const hvExtraNetto = Math.max(0, hvProductDelta) + Math.max(0, hvSachkostenDelta);
  const hvExtraBrutto = hvBaseGesamt != null && hvExtraNetto > 0 ? (noMwst ? hvExtraNetto : Math.round(hvExtraNetto * 1.19 * 100) / 100) : 0;
  const hvAdjustedGesamt = hvBaseGesamt != null && hvExtraBrutto > 0 ? Math.round((hvBaseGesamt + hvExtraBrutto) * 100) / 100 : null;

  useEffect(() => {
    if (hvBaseGesamt != null && hvAdjustedGesamt != null && hvAdjustedGesamt !== hvBaseGesamt) {
      const adjusted = hvAdjustedGesamt.toFixed(2).replace(".", ",");
      setWunschGesamtStr(adjusted);
    } else if (hvBaseGesamt != null && hvExtraBrutto === 0) {
      // Reset to original HV value if no extra costs
      const original = hvBaseGesamt.toFixed(2).replace(".", ",");
      if (parseDE(wunschGesamtStr) !== hvBaseGesamt) {
        // Don't overwrite if user manually changed it to something else
      } else {
        setWunschGesamtStr(original);
      }
    }
  }, [hvAdjustedGesamt, hvBaseGesamt, hvExtraBrutto]);

  const wunschGesamt = parseDE(wunschGesamtStr);
  const computedS = wunschGesamt > 0
    ? calcWeightedForGesamt(wunschGesamt, ml, preisProMl, selectedZuschlaege, sachkosten, noMwst, useBeratungLang, ganzeAmpulle, ampullenpreis)
    : null;
  const liveItems = buildLineItems(praeparat || "Präparat", ml, preisProMl, selectedZuschlaege, sachkosten, computedS, einheit, useBeratungLang, ganzeAmpulle, ampullenpreis);
  const zwischensumme = liveItems.reduce((s, it) => s + it.betrag, 0);
  const defaultItems = buildLineItems(praeparat || "Präparat", ml, preisProMl, [], sachkosten, null, einheit, useBeratungLang, ganzeAmpulle, ampullenpreis);
  const defaultNetto = defaultItems.reduce((s, it) => s + it.betrag, 0);
  const defaultGesamt = noMwst ? defaultNetto : Math.round((defaultNetto * 1.19) * 100) / 100;
  const mwst = noMwst ? 0 : Math.round(zwischensumme * 0.19 * 100) / 100;
  const gesamt = Math.round((zwischensumme + mwst) * 100) / 100;
  const effectiveMaxSteigerung = computedS != null ? Math.max(computedS.s1, computedS.s5, computedS.s267) : 3.5;
  const hasAbove23 = computedS != null && (computedS.s1 > 2.3 || computedS.s5 > 2.3 || computedS.s267 > 2.3);
  const needsBegruendung = hasAbove23 && effectiveMaxSteigerung <= 3.5;

  // Live voucher deduction for the create-page preview
  const liveVoucherBetrag = appliedVoucher ? Math.min(Math.round((appliedVoucher.restwert || 0) * 100) / 100, Math.round(gesamt * 100) / 100) : 0;
  const liveVoucherRedemption = (appliedVoucher && liveVoucherBetrag > 0) ? { code: appliedVoucher.code, betrag: liveVoucherBetrag } : undefined;

  // Zuschlag toggle
  const toggleZuschlag = (code) => {
    setSelectedZuschlaege((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Sachkosten helpers
  const addSachkosten = () => {
    setSachkosten([...sachkosten, { id: nextSkId, description: "", betragStr: "" }]);
    setNextSkId(nextSkId + 1);
  };
  const updateSachkosten = (id, field, value) => {
    setSachkosten(sachkosten.map((sk) => (sk.id === id ? { ...sk, [field]: value } : sk)));
  };
  const removeSachkosten = (id) => {
    setSachkosten(sachkosten.filter((sk) => sk.id !== id));
  };

  const handleSubmit = async () => {
    const errors = {};
    if (!patient.vorname.trim()) errors.patientVorname = true;
    if (!patient.nachname.trim()) errors.patientNachname = true;
    if (patient.email && patient.email.trim() && !/\S+@\S+\.\S+/.test(patient.email)) errors.patientEmail = true;
    // Address fields are optional
    if (!hvOnlyMode && !invoiceMeta.nummer.trim()) errors.nummer = true;
    if (!hvOnlyMode && invoiceMeta.nummer.trim()) {
      const dupInvoice = invoices.find(inv => !inv._hvOnly && !inv._consentForm && !inv._standalone && !inv._deleted && inv.invoiceMeta?.nummer === invoiceMeta.nummer.trim() && inv.id !== amendingId);
      if (dupInvoice) errors.nummerDuplicate = true;
    }
    if (!invoiceMeta.datum) errors.datum = true;
    if (!praeparat.trim()) errors.praeparat = true;
    if (ml <= 0) errors.ml = true;
    if (ganzeAmpulle) {
      if (ampullenpreisStr === "" || ampullenpreis <= 0) errors.ampullenpreis = true;
    } else if (preisProMlStr === "" || preisProMl < 0) errors.preisProMl = true;

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      return;
    }
    setValidationErrors({});
    setIsSaving(true);

    // Save practice settings (plaintext — doctor's own business data)
    if (session) {
      try {
        await supabaseUpdateProfile(session.access_token, user.id, practice);
      } catch (err) {
        console.error("Failed to save practice settings:", err);
      }
    }

    try {
      await handleGenerate();
    } finally {
      setIsSaving(false);
    }
  };

  const savePracticeSettings = async () => {
    if (session) {
      try {
        // practice_data stays plaintext (doctor's own business data)
        await supabaseUpdateProfile(session.access_token, user.id, practice);
        trackEvent("practice_settings_saved", {}, session.access_token);
        const wasFirstTime = isFirstTimeUser;
        setShowSettings(false);
        setIsFirstTimeUser(false);
        if (wasFirstTime) {
          setOnboardingStep("patient");
        } else {
          setSaveToast("Praxiseinstellungen gespeichert");
          setTimeout(() => setSaveToast(""), 3000);
        }
      } catch (err) {
        console.error("Failed to save practice settings:", err);
        showErrorToast("Fehler beim Speichern: " + err.message);
      }
    }
  };

  // ─── Activity log helper ───
  const logActivity = async (patientId, entityType, entityId, actionType, description, metadata = {}) => {
    if (!session || !currentMEK) return;
    try {
      const logData = { description, metadata };
      const enc = await encryptData(logData, currentMEK);
      const created = await supabaseCreateActivityLog(
        session.access_token, user.id, patientId,
        entityType, entityId, actionType,
        enc.ciphertext, enc.iv, 2
      );
      const newEntry = { ...logData, _id: created.id, _patientId: patientId, entityType, entityId, actionType, _createdAt: created.created_at };
      setActivityLog(prev => [newEntry, ...prev]);
    } catch (e) { console.error("Activity log error:", e); }
  };

  // ─── Document CRUD adapters (dual-path: invoices vs documents table) ───
  const saveDocAdapter = async (entry, docType, patientId, behandlungId) => {
    let serverData = entry, serverIv = null, serverEncVer = null;
    if (currentMEK) {
      const enc = await encryptData(entry, currentMEK);
      serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
    }
    if (docsMigrated.current) {
      return supabaseCreateDocument(session.access_token, user.id, patientId, behandlungId, docType, serverData, serverIv, serverEncVer);
    }
    return supabaseCreateInvoice(session.access_token, user.id, serverData, serverIv, serverEncVer);
  };

  const updateDocAdapter = async (docId, entry) => {
    let serverData = entry, serverIv = null, serverEncVer = null;
    if (currentMEK) {
      const enc = await encryptData(entry, currentMEK);
      serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
    }
    if (docsMigrated.current) return supabaseUpdateDocument(session.access_token, docId, serverData, serverIv, serverEncVer);
    return supabaseUpdateInvoice(session.access_token, docId, serverData, serverIv, serverEncVer);
  };

  const deleteDocAdapter = async (docId) => {
    if (docsMigrated.current) return supabaseDeleteDocument(session.access_token, docId);
    return supabaseDeleteInvoice(session.access_token, docId);
  };

  // ─── Voucher (Wertgutschein) handlers ───
  // Encrypt + persist a voucher's data blob and update its plaintext status.
  const persistVoucher = async (voucherId, voucherData, status) => {
    let serverData = voucherData, serverIv = null, serverEncVer = null;
    if (currentMEK) {
      const enc = await encryptData(voucherData, currentMEK);
      serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
    }
    return supabaseUpdateVoucher(session.access_token, voucherId, serverData, serverIv, serverEncVer, status);
  };

  const handleNewVoucher = () => { setViewingVoucher(null); navigate("/gutscheine/erstellen"); };

  const handleCreateVoucher = async (form) => {
    if (!session) return;
    setVoucherBusy(true);
    try {
      const voucherObj = { ...createVoucherObject(form), receiptMeta: form.receiptMeta || {} };
      const today = new Date().toISOString().slice(0, 10);
      const status = computeStatus(voucherObj, today);
      let serverData = voucherObj, serverIv = null, serverEncVer = null;
      if (currentMEK) {
        const enc = await encryptData(voucherObj, currentMEK);
        serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
      }
      // Generate a fully random code; retry on the (astronomically rare) unique
      // collision so a duplicate can never silently fail.
      let created = null, code = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateVoucherCode();
        try {
          created = await supabaseCreateVoucher(session.access_token, user.id, code, status, serverData, serverIv, serverEncVer);
          break;
        } catch (e) {
          const dup = /duplicate|unique|conflict|23505/i.test(String(e?.message || e));
          if (dup && attempt < 4) continue;
          throw e;
        }
      }
      const newVoucher = { ...voucherObj, id: created.id, code, _status: status, _createdAt: created.created_at };
      setVouchers((prev) => [newVoucher, ...prev]);
      setViewingVoucher(newVoucher);
      setVoucherPreviewTab("karte");
      navigate(`/gutscheine/${created.id}`);
    } catch (e) {
      console.error("Create voucher failed:", e);
      showErrorToast("Gutschein konnte nicht erstellt werden: " + (e?.message || e));
    } finally { setVoucherBusy(false); }
  };

  const handleViewVoucher = (v) => { setViewingVoucher(v); setVoucherPreviewTab("karte"); navigate(`/gutscheine/${v.id}`); };

  // Open the in-app confirmation modal (no browser dialogs).
  const handleDeleteVoucher = (v) => setConfirmDeleteVoucher(v);

  const confirmVoucherDelete = async () => {
    const v = confirmDeleteVoucher;
    if (!v) return;
    try {
      if (session && v.id) await supabaseDeleteVoucher(session.access_token, v.id);
      setVouchers((prev) => prev.filter((x) => x.id !== v.id));
      setConfirmDeleteVoucher(null);
      if (viewingVoucher && viewingVoucher.id === v.id) { setViewingVoucher(null); navigate("/gutscheine"); }
    } catch (e) {
      console.error("Delete voucher failed:", e);
      setConfirmDeleteVoucher(null);
      showErrorToast("Löschen fehlgeschlagen: " + (e?.message || e));
    }
  };

  // Look up a voucher by code (scanned or typed) and validate it for redemption.
  const handleApplyVoucher = async (code) => {
    if (!code || !session) return;
    setVoucherLooking(true); setVoucherLookupError("");
    try {
      const row = await supabaseFetchVoucherByCode(session.access_token, user.id, code);
      if (!row) { setVoucherLookupError("Gutschein nicht gefunden."); setAppliedVoucher(null); return; }
      let vData = row.data;
      if (currentMEK && row.encryption_version >= 1 && row.iv && typeof vData === "string") {
        vData = await decryptData(vData, row.iv, currentMEK);
      }
      const voucher = { ...vData, id: row.id, code: row.code, _status: row.status };
      const today = new Date().toISOString().slice(0, 10);
      const reason = redeemBlockReason(voucher, today);
      if (reason) {
        const msgs = { not_found: "Gutschein nicht gefunden.", storniert: "Gutschein wurde storniert.", eingeloest: "Gutschein ist bereits vollständig eingelöst.", abgelaufen: "Gutschein ist abgelaufen." };
        setVoucherLookupError(msgs[reason] || "Gutschein nicht einlösbar."); setAppliedVoucher(null); return;
      }
      setAppliedVoucher(voucher);
    } catch (e) {
      console.error("Voucher lookup failed:", e);
      setVoucherLookupError("Fehler bei der Gutschein-Suche.");
    } finally { setVoucherLooking(false); }
  };

  const handleClearVoucher = () => { setAppliedVoucher(null); setVoucherLookupError(""); };

  const handleGenerate = async () => {
    const items = buildLineItems(praeparat, ml, preisProMl, selectedZuschlaege, hvOnlyMode ? [] : sachkosten, computedS, einheit, useBeratungLang, ganzeAmpulle, ampullenpreis);
    const hasHV = hvOnlyMode ? true : (fromHvId ? false : items.some((it) => it.steigerung != null && it.steigerung > 3.5));
    const patientDbId = createForPatient?._raw?.id || createForPatient?.id || null;
    // Effective invoice total (matches InvoicePreview: targetGesamt overrides when MwSt applies)
    const genIsAusland = patient.country && patient.country !== "Deutschland";
    const genIsMedical = indicationType === "medical" && !!diagnose;
    const genNoMwst = practice.kleinunternehmer || genIsAusland || genIsMedical;
    const genStdGesamt = calcGesamt(items, practice.kleinunternehmer, genIsAusland, genIsMedical);
    const genGesamt = (wunschGesamt > 0 && !genNoMwst) ? wunschGesamt : genStdGesamt;
    const voucherBetrag = (!hvOnlyMode && appliedVoucher)
      ? Math.min(Math.round((appliedVoucher.restwert || 0) * 100) / 100, Math.round(genGesamt * 100) / 100)
      : 0;
    const entry = {
      id: amendingId || Date.now(),
      patient: { ...patient },
      _patientDbId: patientDbId,
      invoiceMeta: hvOnlyMode ? { ...invoiceMeta, nummer: invoiceMeta.nummer || "—" } : { ...invoiceMeta, diagnose: indicationType === "medical" ? diagnose : "" },
      lineItems: items,
      hasHV,
      _hvOnly: hvOnlyMode || undefined,
      praeparat,
      einheit,
      ml,
      mlStr,
      preisProMl,
      preisProMlStr,
      ganzeAmpulle,
      ampullenpreis,
      ampullenpreisStr,
      wunschGesamtStr,
      targetGesamt: wunschGesamt > 0 ? wunschGesamt : undefined,
      useBeratungLang,
      begruendung: needsBegruendung ? (begruendung || "Überdurchschnittlicher Zeitaufwand und erhöhte Schwierigkeit aufgrund individueller anatomischer Gegebenheiten.") : "",
      selectedZuschlaege: [...selectedZuschlaege],
      sachkosten: hvOnlyMode ? [] : sachkosten.map((sk) => ({ ...sk })),
      treatmentDoc: treatmentMarkers.length > 0 ? { markers: treatmentMarkers.map(m => ({ x: m.x, y: m.y, amount: m.amount })), behandlungsDatum: invoiceMeta.datum, praeparat, einheit, facePhoto: treatmentFacePhoto || "" } : null,
      attachTreatmentPdf: hvOnlyMode ? false : attachTreatmentPdf,
      paymentStatus: hvOnlyMode ? "ausstehend" : (markAsPaid ? "bezahlt" : "ausstehend"),
      indicationType: hvOnlyMode ? undefined : indicationType,
      _fromHvId: fromHvId || undefined,
      _kleinunternehmer: !!practice.kleinunternehmer,
      _practice: { ...practice, logo: practice.logo || "" },
      voucherRedemption: (!hvOnlyMode && appliedVoucher && voucherBetrag > 0)
        ? { voucherId: appliedVoucher.id, code: appliedVoucher.code, betrag: voucherBetrag }
        : undefined,
      savedAt: new Date().toISOString(),
    };

    // Persist to Supabase (E2EE: encrypt entire data object)
    if (session) {
      try {
        const genDocType = hvOnlyMode ? "hv" : "rechnung";
        const genPatientId = createForPatient?._raw?.id || createForPatient?.id || entry._patientDbId || null;
        const genBehandlungId = pendingDocBehIdRef.current || entry._behandlungId || null;
        if (pendingDocBehIdRef.current) { entry._behandlungId = pendingDocBehIdRef.current; pendingDocBehIdRef.current = null; }

        const amendingEntry = invoices.find((inv) => inv.id === amendingId);
        if (amendingEntry && amendingEntry._supabaseId) {
          // Update existing
          await updateDocAdapter(amendingEntry._supabaseId, entry);
          setInvoices(invoices.map((inv) => (inv.id === amendingId ? { ...entry, _supabaseId: amendingEntry._supabaseId, _docType: genDocType, _behandlungId: genBehandlungId } : inv)));
          logActivity(genPatientId, genDocType === "hv" ? "hv" : "rechnung", amendingEntry._supabaseId, "updated", `${genDocType === "hv" ? "Honorarvereinbarung" : "Rechnung"} ${entry.invoiceMeta?.nummer || ""} aktualisiert`);
        } else {
          // Create new
          const created = await saveDocAdapter(entry, genDocType, genPatientId, genBehandlungId);
          const newEntry = { ...entry, _supabaseId: created.id, _docType: genDocType, _behandlungId: genBehandlungId, _createdAt: created.created_at || new Date().toISOString() };
          setInvoices([newEntry, ...invoices]);
          setViewingInvoice(newEntry);
          logActivity(genPatientId, genDocType === "hv" ? "hv" : "rechnung", created.id, "created", `${genDocType === "hv" ? "Honorarvereinbarung" : "Rechnung"} ${entry.invoiceMeta?.nummer || ""} erstellt`);

          // Redeem the applied voucher now that the invoice is saved (new invoices only)
          if (appliedVoucher && voucherBetrag > 0) {
            try {
              const datum = entry.invoiceMeta?.datum || new Date().toISOString().slice(0, 10);
              const { voucher: updatedV } = applyRedemption(appliedVoucher, { invoiceId: created.id, gesamt: voucherBetrag, datum });
              const newStatus = computeStatus(updatedV, new Date().toISOString().slice(0, 10));
              await persistVoucher(appliedVoucher.id, updatedV, newStatus);
              setVouchers((prev) => prev.map((v) => v.id === appliedVoucher.id ? { ...v, ...updatedV, _status: newStatus } : v));
              setAppliedVoucher(null); setVoucherLookupError("");
            } catch (e) { console.error("Voucher redemption failed:", e); }
          }
        }

        // Upsert patient (encrypted: manual find-then-insert/update)
        try {
          if (currentMEK) {
            const patientHash = await computePatientHash(getPatientIdentifier(patient), currentMEK);
            const { ciphertext: ptCipher, iv: ptIv } = await encryptData(patient, currentMEK);
            // Check if patient with this hash already exists (E2EE records)
            const existingRes = await fetch(
              `${SUPABASE_URL}/rest/v1/patients?user_id=eq.${pgv(user.id)}&patient_hash=eq.${pgv(patientHash)}`,
              { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
            );
            const existing = await existingRes.json();
            if (existing.length > 0) {
              // Update existing patient (found by hash)
              await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${pgv(existing[0].id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                body: JSON.stringify({ data: ptCipher, iv: ptIv, patient_hash: patientHash, encryption_version: 1 }),
              });
            } else {
              // Also check for pre-E2EE record by plain email (only if email exists)
              let legacy = [];
              if (patient.email && patient.email.trim()) {
                const legacyRes = await fetch(
                  `${SUPABASE_URL}/rest/v1/patients?user_id=eq.${pgv(user.id)}&email=eq.${pgv(patient.email.toLowerCase().trim())}`,
                  { headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } }
                );
                legacy = await legacyRes.json();
              }
              if (legacy.length > 0) {
                // Migrate pre-E2EE patient to encrypted
                await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${pgv(legacy[0].id)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                  body: JSON.stringify({ data: ptCipher, iv: ptIv, patient_hash: patientHash, email: patientHash, encryption_version: 1 }),
                });
              } else {
                // Insert new patient
                const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                  body: JSON.stringify({ user_id: user.id, email: patientHash, patient_hash: patientHash, data: ptCipher, iv: ptIv, encryption_version: 1 }),
                });
                if (!insertRes.ok) console.error("[E2EE] Failed to insert patient:", await insertRes.text());
              }
            }
          } else {
            // Fail closed: never write an unencrypted patient (plaintext PII).
            // currentMEK is always set for a logged-in user; if it somehow isn't,
            // skip the patient-table upsert rather than storing plaintext. The
            // patient data is still persisted encrypted inside the saved document.
            console.warn("Skipping patient upsert: encryption key not available");
          }
          // Reload patients (decrypted)
          const patientRecords = await supabaseFetchPatients(session.access_token, user.id);
          const decryptedPatients = [];
          for (const rec of patientRecords) {
            let pd = rec.data;
            if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof pd === "string") {
              try { pd = await decryptData(pd, rec.iv, currentMEK); } catch (e) { continue; }
            }
            decryptedPatients.push({ ...rec, data: pd });
          }
          setPatients(decryptedPatients);
        } catch (err) {
          console.error("Failed to upsert patient:", err);
        }
      } catch (err) {
        console.error("Failed to save invoice:", err);
        showErrorToast("Fehler beim Speichern der Rechnung: " + err.message);
        return;
      }
    } else {
      // Fallback: local only
      if (amendingId) {
        setInvoices(invoices.map((inv) => (inv.id === amendingId ? entry : inv)));
      } else {
        setInvoices([entry, ...invoices]);
      }
    }

    const docType = hvOnlyMode ? "hv" : (hasHV ? "invoice_with_hv" : "invoice");
    trackEvent(amendingId ? "document_edited" : "document_created", { type: docType, has_treatment_doc: !!entry.treatmentDoc }, session?.access_token);
    setAmendingId(null);
    setPreviewTab(hvOnlyMode ? "honorar" : "rechnung");
    setHvOnlyMode(false);
    if (patientCreateModal) setPatientCreateModal(null);
    navigateToPreview(entry);
    window.scrollTo(0, 0);
    setSaveToast(hvOnlyMode ? "Honorarvereinbarung gespeichert" : (fromHvId ? "Rechnung gespeichert (HV verknüpft)" : (hasHV ? "Dokumente gespeichert" : "Dokument gespeichert")));
    setTimeout(() => setSaveToast(""), 3000);
    // Signature modal is now triggered from the HV preview signature area tap
  };

  const handleNew = () => {
    const maxNr = invoices.reduce((max, inv) => Math.max(max, Number(inv.invoiceMeta.nummer) || 0), 0);
    setPatient({ vorname: "", nachname: "", email: "", phone: "", address1: "", address2: "", country: "Deutschland" });
    const realInv = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
    const latestInv = realInv.length > 0 ? realInv.reduce((best, i) => { const t = i._createdAt || i.savedAt || ""; const bt = best._createdAt || best.savedAt || ""; return t > bt ? i : best; }, realInv[0]) : null;
    const existingNummern0 = new Set(realInv.map(i => i.invoiceMeta.nummer));
    let suggestedNummer = latestInv ? nextInvoiceNumber(latestInv.invoiceMeta.nummer) || "" : "";
    while (suggestedNummer && existingNummern0.has(suggestedNummer)) { suggestedNummer = nextInvoiceNumber(suggestedNummer) || ""; }
    setInvoiceMeta({ nummer: suggestedNummer, ort: invoiceMeta.ort, datum: new Date().toISOString().slice(0, 10), zahlungsfrist: practice.zahlungsfrist ?? 14 });
    setPraeparat("");
    setEinheit("SE");
    setMlStr("1");
    setGanzeAmpulle(false);
    setAmpullenpreisStr("");
    setSelectedZuschlaege([]);
    setSachkosten([]);
    setWunschGesamtStr(""); setUseBeratungLang(false);

    setTreatmentMarkers([]);
    setTreatmentFacePhoto("");
    setMarkAsPaid(false);
    setHvOnlyMode(false);
    setAmendingId(null);
    setCreateForPatient(null);
    setIndicationType("aesthetic");
    setDiagnose("");
    setAppliedVoucher(null); setVoucherLookupError("");
    setShowIndicationModal(true);
    navigate("/erstellen");
  };

  const handleNewHV = () => {
    setPatient({ vorname: "", nachname: "", email: "", phone: "", address1: "", address2: "", country: "Deutschland" });
    setInvoiceMeta({ nummer: "", ort: invoiceMeta.ort || practice.city || "", datum: new Date().toISOString().slice(0, 10), zahlungsfrist: practice.zahlungsfrist ?? 14 });
    setPraeparat("");
    setEinheit("SE");
    setMlStr("1");
    setGanzeAmpulle(false);
    setAmpullenpreisStr("");
    setSelectedZuschlaege([]);
    setSachkosten([]);
    setWunschGesamtStr(""); setUseBeratungLang(false);
    setTreatmentMarkers([]);
    setTreatmentFacePhoto("");
    setMarkAsPaid(false);
    setHvOnlyMode(true);
    setAmendingId(null);
    setCreateForPatient(null);
    navigate("/erstellen");
  };

  const handleNewHVForPatient = (patientObj) => {
    const d = patientObj.data || patientObj._raw?.data || patientObj;
    setPatient({
      vorname: d.vorname || patientObj.vorname || "",
      nachname: d.nachname || patientObj.nachname || "",
      email: d.email || patientObj.email || "",
      phone: d.phone || "",
      address1: d.address1 || "",
      address2: d.address2 || "",
      country: d.country || "Deutschland",
    });
    setInvoiceMeta({ nummer: "", ort: invoiceMeta.ort || practice.city || "", datum: new Date().toISOString().slice(0, 10), zahlungsfrist: practice.zahlungsfrist ?? 14 });
    setPraeparat("");
    setEinheit("SE");
    setMlStr("1");
    setGanzeAmpulle(false);
    setAmpullenpreisStr("");
    setSelectedZuschlaege([]);
    setSachkosten([]);
    setWunschGesamtStr(""); setUseBeratungLang(false);
    setTreatmentMarkers([]);
    setTreatmentFacePhoto("");
    setMarkAsPaid(false);
    setHvOnlyMode(true);
    setAmendingId(null);
    setFromHvId(null);
    setHvBaseGesamt(null);
    setHvBaseProductCost(null);
    setHvBaseSachkosten(0);
    setCreateForPatient(patientObj);
    if (isPatientDetail && window.innerWidth >= 1024) {
      setCreateSource("patientDetail");
      setPatientCreateModal("hv");
    } else {
      setCreateSource("list");
      navigate("/erstellen");
    }
  };

  const handleNewForPatient = (patientObj) => {
    const d = patientObj.data || patientObj._raw?.data || patientObj;
    const realInv = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
    const latestInv = realInv.length > 0 ? realInv.reduce((best, i) => { const t = i._createdAt || i.savedAt || ""; const bt = best._createdAt || best.savedAt || ""; return t > bt ? i : best; }, realInv[0]) : null;
    const existingNummern = new Set(realInv.map(i => i.invoiceMeta.nummer));
    let suggestedNummer = latestInv ? nextInvoiceNumber(latestInv.invoiceMeta.nummer) || "" : "";
    while (suggestedNummer && existingNummern.has(suggestedNummer)) { suggestedNummer = nextInvoiceNumber(suggestedNummer) || ""; }
    setPatient({
      vorname: d.vorname || patientObj.vorname || "",
      nachname: d.nachname || patientObj.nachname || "",
      email: d.email || patientObj.email || "",
      phone: d.phone || "",
      address1: d.address1 || "",
      address2: d.address2 || "",
      country: d.country || "Deutschland",
    });
    setInvoiceMeta({ nummer: suggestedNummer, ort: invoiceMeta.ort, datum: new Date().toISOString().slice(0, 10), zahlungsfrist: practice.zahlungsfrist ?? 14 });
    setPraeparat("");
    setEinheit("SE");
    setMlStr("1");
    setGanzeAmpulle(false);
    setAmpullenpreisStr("");
    setSelectedZuschlaege([]);
    setSachkosten([]);
    setWunschGesamtStr(""); setUseBeratungLang(false);
    setTreatmentMarkers([]);
    setTreatmentFacePhoto("");
    setMarkAsPaid(false);
    setHvOnlyMode(false);
    setAmendingId(null);
    setAppliedVoucher(null); setVoucherLookupError("");
    setFromHvId(null);
    setHvBaseGesamt(null);
    setHvBaseProductCost(null);
    setHvBaseSachkosten(0);
    setCreateForPatient(patientObj);
    setIndicationType("aesthetic");
    setDiagnose("");
    setShowIndicationModal(true);
    if (isPatientDetail && window.innerWidth >= 1024) {
      setCreateSource("patientDetail");
      setPatientCreateModal("rechnung");
    } else {
      setCreateSource("list");
      navigate("/erstellen");
    }
  };

  const handleAmend = (inv, fromTab) => {
    setPatient(inv.patient || { vorname: "", nachname: "", email: "", phone: "", address1: "", address2: "", country: "Deutschland" });
    setInvoiceMeta({ zahlungsfrist: practice.zahlungsfrist ?? 14, ...(inv.invoiceMeta || { nummer: "", ort: "", datum: "" }) });
    setPraeparat(inv.praeparat || "");
    setEinheit(inv.einheit || "ml");
    setMlStr(inv.mlStr || (inv.ml != null ? toDE(inv.ml) : ""));
    setPreisProMlStr(inv.preisProMlStr || (inv.preisProMl != null ? toDE(inv.preisProMl) : ""));
    setGanzeAmpulle(!!inv.ganzeAmpulle);
    setAmpullenpreisStr(inv.ampullenpreisStr || (inv.ampullenpreis != null ? toDE(inv.ampullenpreis) : ""));
    setSelectedZuschlaege(inv.selectedZuschlaege || []);
    setSachkosten(inv.sachkosten || []);
    setWunschGesamtStr(inv.wunschGesamtStr || inv.wunschNettoStr || ""); setUseBeratungLang(inv.useBeratungLang || false); setBegruendung(inv.begruendung || "");
    if (inv.treatmentDoc && inv.treatmentDoc.markers) {
      setTreatmentMarkers(inv.treatmentDoc.markers.map((m, i) => ({ id: Date.now() + i, ...m })));
      setTreatmentFacePhoto(inv.treatmentDoc.facePhoto || "");
    } else {
      setTreatmentMarkers([]);
      setTreatmentFacePhoto("");
    }
    setMarkAsPaid(inv.paymentStatus === "bezahlt");
    setIndicationType(inv.indicationType || (inv.invoiceMeta?.diagnose ? "medical" : "aesthetic"));
    setDiagnose(inv.invoiceMeta?.diagnose || "");
    setShowIndicationModal(false);
    setHvOnlyMode(fromTab === "honorar" ? true : !!inv._hvOnly);
    setFromHvId(inv._fromHvId || null);
    setHvBaseGesamt(null);
    setHvBaseProductCost(null);
    setHvBaseSachkosten(0);
    setAmendingId(inv.id);
    setCreateForPatient(null);
    setPatientCreateModal(null);
    setValidationErrors({});
    navigate("/erstellen");
  };

  const handleDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const toDelete = invoices.find((inv) => inv.id === confirmDeleteId);

    // Delete from Supabase
    if (session && toDelete && toDelete._supabaseId) {
      try {
        await deleteDocAdapter(toDelete._supabaseId);
      } catch (err) {
        console.error("Failed to delete document:", err);
        showErrorToast("Fehler beim Löschen: " + err.message);
        return;
      }
    }

    // Storno re-credit: if this invoice redeemed a voucher, restore exactly that betrag
    if (session && toDelete?.voucherRedemption?.code && toDelete?._supabaseId) {
      try {
        const row = await supabaseFetchVoucherByCode(session.access_token, user.id, toDelete.voucherRedemption.code);
        if (row) {
          let vData = row.data;
          if (currentMEK && row.encryption_version >= 1 && row.iv && typeof vData === "string") vData = await decryptData(vData, row.iv, currentMEK);
          const { restored, voucher: restoredV } = restoreRedemption(vData, toDelete._supabaseId);
          if (restored > 0) {
            const newStatus = computeStatus(restoredV, new Date().toISOString().slice(0, 10));
            await persistVoucher(row.id, restoredV, newStatus);
            setVouchers((prev) => prev.map((v) => v.id === row.id ? { ...v, ...restoredV, _status: newStatus } : v));
          }
        }
      } catch (e) { console.error("Voucher restore on delete failed:", e); }
    }

    trackEvent("document_deleted", { type: toDelete?._hvOnly ? "hv" : toDelete?._standalone ? "treatment_doc" : "invoice" }, session?.access_token);
    const delDocType = toDelete?._docType || (toDelete?._consentForm ? "aufklaerung" : toDelete?._hvOnly ? "hv" : toDelete?._standalone ? "behandlungsdoku" : "rechnung");
    logActivity(toDelete?._patientDbId, delDocType, toDelete?._supabaseId, "deleted", `${delDocType === "aufklaerung" ? "Aufklärungsbogen" : delDocType === "hv" ? "Honorarvereinbarung" : delDocType === "behandlungsdoku" ? "Behandlungsdoku" : "Rechnung"} gelöscht`);
    setInvoices(invoices.filter((inv) => inv.id !== confirmDeleteId));
    setConfirmDeleteId(null);
    if (viewingInvoice && viewingInvoice.id === confirmDeleteId) {
      navigate("/rechnungen");
      setViewingInvoice(null);
    }
  };

  const confirmDeleteKeepHV = async () => {
    const toConvert = invoices.find((inv) => inv.id === confirmDeleteId);
    if (!toConvert) return;

    // Convert to standalone HV: keep GOÄ line items, remove invoice-specific data
    const converted = {
      ...toConvert,
      _hvOnly: true,
      hasHV: true,
      attachTreatmentPdf: false,
      paymentStatus: "ausstehend",
      sachkosten: [],
      lineItems: toConvert.lineItems.filter((it) => !it.isProduct || it.isPraeparat),
    };

    // Update in Supabase (E2EE: encrypt entire data object)
    if (session && converted._supabaseId) {
      try {
        await updateDocAdapter(converted._supabaseId, converted);
      } catch (err) {
        console.error("Failed to convert invoice to standalone HV:", err);
        showErrorToast("Fehler: " + err.message);
        return;
      }
    }

    trackEvent("invoice_deleted_keep_hv", {}, session?.access_token);
    setInvoices(invoices.map((inv) => (inv.id === confirmDeleteId ? converted : inv)));
    setConfirmDeleteId(null);
    if (viewingInvoice && viewingInvoice.id === confirmDeleteId) {
      setViewingInvoice(converted);
      setPreviewTab("honorar");
    }
  };

  const confirmDeletePatientAction = async () => {
    if (!confirmDeletePatient) return;
    const patientEmail = (confirmDeletePatient.data?.email || confirmDeletePatient.email || "").toLowerCase();

    // Find all invoices for this patient
    const matchingInvoices = invoices.filter((inv) => (inv.patient?.email || "").toLowerCase() === patientEmail);

    // Delete all matching invoices from Supabase
    if (session) {
      try {
        for (const inv of matchingInvoices) {
          if (inv._supabaseId) {
            await deleteDocAdapter(inv._supabaseId);
          }
        }
        // Delete the patient record
        if (confirmDeletePatient.id) {
          await supabaseDeletePatient(session.access_token, confirmDeletePatient.id);
        }
      } catch (err) {
        console.error("Failed to delete patient:", err);
        showErrorToast("Fehler beim Löschen: " + err.message);
        return;
      }
    }

    // Update local state
    trackEvent("patient_deleted", { invoices_deleted: matchingInvoices.length }, session?.access_token);
    const deletedInvoiceIds = new Set(matchingInvoices.map((inv) => inv.id));
    setInvoices(invoices.filter((inv) => !deletedInvoiceIds.has(inv.id)));
    setPatients(patients.filter((p) => p.id !== confirmDeletePatient.id));
    setConfirmDeletePatient(null);
    setSelectedPatient(null);
    navigate("/patients");
  };

  const handleView = (inv) => {
    setPreviewTab(inv._consentForm ? "consent" : "rechnung");
    navigateToPreview(inv);
  };

  // ─── PDF download helper (html2canvas → jsPDF) ───
  const downloadPDF = async (elementId, filename) => {
    const result = await generatePDFBlob(elementId);
    if (!result) return;
    result.pdf.save(filename);
  };

  // ─── Print helper (opens print dialog) ───
  const printElement = (elementId, title) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    // Escape the title before injecting it into the new window's markup — it can
    // contain user-controlled text (e.g. the invoice number) that would otherwise
    // break out of the <title> tag. The body uses el.outerHTML, which is already
    // HTML-escaped by React.
    const safeTitle = String(title).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const win = window.open("", "_blank", "width=800,height=1100");
    win.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
      <style>body{margin:0;padding:0;} @page{size:A4;margin:0;} @media print{body{-webkit-print-color-adjust:exact;}}</style>
      </head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const handlePrintInvoice = (inv) => {
    setPreviewTab("rechnung");
    navigateToPreview(inv);
    setTimeout(() => printElement("invoice-preview", `Rechnung ${inv.invoiceMeta.nummer}`), 100);
  };

  const handleDownloadCurrent = async () => {
    const nr = viewingInvoice?.invoiceMeta?.nummer || "X";
    const elementId = previewTab === "behandlung" ? "invoice-treatment-doc-preview" : previewTab === "honorar" ? "hv-preview" : "invoice-preview";
    const filename = previewTab === "behandlung" ? `Behandlungsdokumentation_${nr}.pdf` : previewTab === "honorar" ? `Honorarvereinbarung_${nr}.pdf` : `Rechnung_${nr}.pdf`;
    try {
      const result = await generatePDFBlob(elementId);
      if (!result) { showErrorToast("PDF konnte nicht erstellt werden: Dokument nicht gefunden."); return; }
      const { pdf } = result;
      // Append treatment doc as page 2 for invoices (not HV/behandlung) when flag is set
      if (previewTab === "rechnung" && viewingInvoice?.attachTreatmentPdf && viewingInvoice?.treatmentDoc) {
        await appendPageToPDF(pdf, "invoice-treatment-doc-preview");
      }
      trackEvent("pdf_downloaded", { type: previewTab }, session?.access_token);
      pdf.save(filename);
    } catch (e) {
      console.error("PDF download failed:", e);
      showErrorToast("PDF konnte nicht erstellt werden: " + (e?.message || e));
    }
  };

  // ─── Behandlung CRUD handlers ───
  const handleCreateBehandlung = async (patientId, behData) => {
    let serverData = behData, serverIv = null, serverEncVer = null;
    if (currentMEK) {
      const enc = await encryptData(behData, currentMEK);
      serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
    }
    const created = await supabaseCreateBehandlung(session.access_token, user.id, patientId, serverData, serverIv, serverEncVer);
    const newBeh = { ...behData, _id: created.id, _patientId: patientId, _createdAt: created.created_at };
    setBehandlungen(prev => [newBeh, ...prev]);
    logActivity(patientId, "behandlung", created.id, "created", `Behandlung am ${behData.datum || ""} erstellt`);
    return created.id;
  };

  const handleUpdateBehandlung = async (behId, behData) => {
    let serverData = behData, serverIv = null, serverEncVer = null;
    if (currentMEK) {
      const enc = await encryptData(behData, currentMEK);
      serverData = enc.ciphertext; serverIv = enc.iv; serverEncVer = 2;
    }
    await supabaseUpdateBehandlung(session.access_token, behId, serverData, serverIv, serverEncVer);
    const beh = behandlungen.find(b => b._id === behId);
    setBehandlungen(prev => prev.map(b => b._id === behId ? { ...behData, _id: behId, _patientId: b._patientId, _createdAt: b._createdAt } : b));
    logActivity(beh?._patientId, "behandlung", behId, "updated", `Behandlung aktualisiert`);
  };

  const handleDeleteBehandlung = async (behId) => {
    const beh = behandlungen.find(b => b._id === behId);
    await supabaseDeleteBehandlung(session.access_token, behId);
    setBehandlungen(prev => prev.filter(b => b._id !== behId));
    setInvoices(prev => prev.map(inv => inv._behandlungId === behId ? { ...inv, _behandlungId: null } : inv));
    logActivity(beh?._patientId, "behandlung", behId, "deleted", `Behandlung gelöscht`);
  };

  const handleLinkDocToBehandlung = async (docId, behandlungId) => {
    if (docsMigrated.current) {
      await supabaseUpdateDocumentBehandlung(session.access_token, docId, behandlungId);
    }
    setInvoices(prev => prev.map(inv => inv._supabaseId === docId ? { ...inv, _behandlungId: behandlungId } : inv));
  };

  // E2EE helper: fetch document from Supabase, decrypt, apply modifier, re-encrypt, save
  const e2eeFetchModifySave = async (token, supabaseId, modifier) => {
    const table = docsMigrated.current ? "documents" : "invoices";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${pgv(supabaseId)}&select=data,iv,encryption_version`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    const rows = await res.json();
    if (rows.length === 0) return;
    let stored = rows[0].data;
    if (currentMEK && rows[0].encryption_version >= 1 && rows[0].iv && typeof stored === "string") stored = await decryptData(stored, rows[0].iv, currentMEK);
    if (currentMEK && stored.encrypted_patient && stored.patient_iv) { stored.patient = await decryptData(stored.encrypted_patient, stored.patient_iv, currentMEK); delete stored.encrypted_patient; delete stored.patient_iv; }
    const modified = typeof modifier === "function" ? modifier(stored) : { ...stored, ...modifier };
    await updateDocAdapter(supabaseId, modified);
  };

  // Helper: update the currently viewing invoice (and any linked docs) and persist
  const updateViewingInvoiceData = async (updates) => {
    if (!viewingInvoice) return;
    const updated = { ...viewingInvoice, ...updates };
    setViewingInvoice(updated);
    setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? updated : inv));
    if (session && updated._supabaseId) {
      try {
        await e2eeFetchModifySave(session.access_token, updated._supabaseId, updates);
      } catch (e) { console.error("Failed to persist update:", e); }
    }
  };

  // ─── Consent Form Completion Handler ───
  const handleConsentComplete = async (consentData) => {
    if (!consentPatient) return;
    const rawData = (consentPatient._raw && typeof consentPatient._raw.data === "object" && consentPatient._raw.data) ? consentPatient._raw.data : {};
    const patientDbId = consentPatient._raw ? consentPatient._raw.id : consentPatient.id;
    const entry = {
      id: "consent_" + crypto.randomUUID(),
      _consentForm: true,
      _patientDbId: patientDbId,
      patient: { vorname: rawData.vorname || consentPatient.vorname || "", nachname: rawData.nachname || consentPatient.nachname || "", email: rawData.email || consentPatient.email || "", phone: rawData.phone || "", address1: rawData.address1 || "", address2: rawData.address2 || "", country: rawData.country || "Deutschland" },
      invoiceMeta: { datum: consentData.treatmentDate || new Date().toISOString().slice(0, 10), ort: practice.city || "" },
      consentData: { ...consentData, templateId: consentTemplate?.id, templateVersion: consentTemplate?.version },
      _practice: { ...practice, logo: practice.logo || "" },
      _kleinunternehmer: false,
      savedAt: new Date().toISOString(),
    };
    // Only generate PDF hash if both signatures are present (document is complete)
    const hasBothSigs = entry.consentData._signatures?.patient && entry.consentData._signatures?.doctor;
    if (hasBothSigs) {
      try {
        setViewingInvoice(entry);
        await new Promise(r => setTimeout(r, 300));
        const result = await generateMultiPagePDF("consent-form-pdf-target");
        if (result) {
          const pdfArrayBuffer = result.pdf.output("arraybuffer");
          const hashBuffer = await crypto.subtle.digest("SHA-256", pdfArrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const pdfHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
          entry.consentData.pdfHash = pdfHash;
        }
      } catch (e) { console.error("Consent PDF hash error:", e); }
    }
    // Persist to Supabase with E2EE
    if (session) {
      try {
        const consentBehId = pendingDocBehIdRef.current || entry._behandlungId || null;
        entry._behandlungId = consentBehId;
        const created = await saveDocAdapter(entry, "aufklaerung", patientDbId, consentBehId);
        entry._supabaseId = created.id;
        entry._docType = "aufklaerung";
        entry._createdAt = created.created_at || new Date().toISOString();
        logActivity(patientDbId, "aufklaerung", created.id, "created", "Aufklärungsbogen erstellt");
        pendingDocBehIdRef.current = null;
      } catch (e) { console.error("Failed to save consent form:", e); }
    }
    // Auto-sync demographics + anamnese (Ja answers) from consent form to patient profile
    try {
      const demoFields = {};
      if (consentData.answers) {
        if (consentData.answers.geburtsdatum) demoFields.geburtsdatum = consentData.answers.geburtsdatum;
        if (consentData.answers.groesse) demoFields.groesse = consentData.answers.groesse;
        if (consentData.answers.gewicht) demoFields.gewicht = consentData.answers.gewicht;
        if (consentData.answers.geschlecht) demoFields.geschlecht = consentData.answers.geschlecht;
      }
      // Build anamnese entries from Ja answers
      const tplForAnamnese = CONSENT_TEMPLATES.find(t => t.id === consentTemplate?.id);
      const allQs = tplForAnamnese ? [...tplForAnamnese.questions, ...(tplForAnamnese.additionalQuestionsWomen || [])] : [];
      const today = new Date().toISOString().slice(0, 10);
      const newAnamneseEntries = allQs
        .filter(q => consentData.answers?.[q.id] === true)
        .map(q => ({ questionId: q.id, questionLabel: q.label, detailText: consentData.answers?.[q.id + "_text"] || "", addedAt: today }));
      if ((Object.keys(demoFields).length > 0 || newAnamneseEntries.length > 0) && session && currentMEK && consentPatient._raw) {
        const raw = consentPatient._raw;
        const existingData = (typeof raw.data === "object" && raw.data) ? raw.data : {};
        // Merge demographics
        const merged = { ...existingData, ...demoFields };
        // Merge anamnese: add new entries (by questionId), update detailText if changed but keep original addedAt
        const existingAnamnese = existingData.anamnese || [];
        const updatedAnamnese = [...existingAnamnese];
        for (const entry of newAnamneseEntries) {
          const idx = updatedAnamnese.findIndex(e => e.questionId === entry.questionId);
          if (idx === -1) {
            updatedAnamnese.push(entry);
          } else if (entry.detailText && entry.detailText !== updatedAnamnese[idx].detailText) {
            updatedAnamnese[idx] = { ...updatedAnamnese[idx], detailText: entry.detailText };
          }
        }
        merged.anamnese = updatedAnamnese;
        const newPatientHash = await computePatientHash(getPatientIdentifier(merged), currentMEK);
        const { ciphertext, iv } = await encryptData(merged, currentMEK);
        await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${pgv(raw.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
          body: JSON.stringify({ data: ciphertext, iv, patient_hash: newPatientHash, encryption_version: 1 }),
        });
        // Reload patients to reflect changes
        const patientRecords = await supabaseFetchPatients(session.access_token, user.id);
        const decryptedPatients = [];
        for (const rec of patientRecords) {
          let pd = rec.data;
          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof pd === "string") {
            try { pd = await decryptData(pd, rec.iv, currentMEK); } catch (e) { continue; }
          }
          decryptedPatients.push({ ...rec, data: pd });
        }
        setPatients(decryptedPatients);
        // Update selectedPatient
        const updated = decryptedPatients.find(p => p.id === raw.id);
        if (updated) {
          const ud = (typeof updated?.data === "object" && updated?.data) || {};
          setSelectedPatient({ vorname: ud.vorname || "", nachname: ud.nachname || "", email: ud.email || "", _raw: updated });
        }
      }
    } catch (e) { console.error("Error syncing consent demographics/anamnese to patient:", e); }

    setInvoices(prev => [entry, ...prev]);
    if (kioskPin) {
      // Kiosk mode: keep the patient on a handback screen; the app is only
      // reachable again after the practice PIN is entered (finalizeConsentHandback).
      setConsentHandback(entry);
    } else {
      finalizeConsentHandback(entry);
    }
  };

  // Leave the consent kiosk flow and show the saved document (doctor view)
  const finalizeConsentHandback = (entry) => {
    setPreviewTab("consent");
    consentCompletingRef.current = true;
    if (patientCreateModal) setPatientCreateModal(null);
    navigateToPreview(entry);
    setConsentPatient(null);
    setConsentTemplate(null);
    setConsentHandback(null);
    setConsentHandbackPin(false);
    setSaveToast("Aufklärungsbogen gespeichert");
    setTimeout(() => { setSaveToast(""); consentCompletingRef.current = false; }, 2500);
  };

  const handleSignatureComplete = async (sigs) => {
    setShowSignatureModal(false);
    if (!sigs) return;
    const signatures = {};
    if (sigs.doctor) signatures.doctor = sigs.doctor;
    if (sigs.patient) signatures.patient = sigs.patient;
    // Merge with existing signatures
    const merged = { ...(viewingInvoice?._signatures || {}), ...signatures };
    await updateViewingInvoiceData({ _signatures: merged });
    setSaveToast("Unterschrift gespeichert");
    setTimeout(() => setSaveToast(""), 2500);
  };

  const handleHvDoctorSignComplete = async (doctorSigDataUrl) => {
    setShowHvDoctorSign(false);
    if (!doctorSigDataUrl) return;
    const targetInv = viewingInvoice._fromHvId
      ? invoices.find((inv) => inv.id === viewingInvoice._fromHvId)
      : viewingInvoice;
    const merged = { ...(targetInv?._signatures || {}), doctor: doctorSigDataUrl };
    await updateViewingInvoiceData({ _signatures: merged });
    setSaveToast("Ärzt:in Unterschrift gespeichert");
    setTimeout(() => setSaveToast(""), 2500);
  };

  const handleHvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const isPdf = file.type === "application/pdf";
      let data;
      if (isPdf) {
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else {
        data = await compressImage(file, 1200, 0.85);
      }
      const targetInv = viewingInvoice._fromHvId
        ? invoices.find((inv) => inv.id === viewingInvoice._fromHvId)
        : (viewingInvoice._hvOnly || viewingInvoice.hasHV) ? viewingInvoice : null;
      if (!targetInv) {
        // Upload to the current viewing invoice
        await updateViewingInvoiceData({
          _signedHvUpload: { type: isPdf ? "pdf" : "image", data, filename: file.name, uploadedAt: new Date().toISOString() },
        });
      } else if (targetInv.id === viewingInvoice.id) {
        await updateViewingInvoiceData({
          _signedHvUpload: { type: isPdf ? "pdf" : "image", data, filename: file.name, uploadedAt: new Date().toISOString() },
        });
      } else {
        // Update the linked HV entry
        const updatedHv = { ...targetInv, _signedHvUpload: { type: isPdf ? "pdf" : "image", data, filename: file.name, uploadedAt: new Date().toISOString() } };
        setInvoices((prev) => prev.map((inv) => inv.id === targetInv.id ? updatedHv : inv));
        if (session && targetInv._supabaseId) {
          try {
            await e2eeFetchModifySave(session.access_token, targetInv._supabaseId, { _signedHvUpload: updatedHv._signedHvUpload });
          } catch (err) { console.error("Failed to persist HV upload:", err); }
        }
      }
      setSaveToast("Unterschriebene HV hochgeladen");
      setTimeout(() => setSaveToast(""), 2500);
    } catch (err) {
      console.error("HV upload error:", err);
      showErrorToast("Fehler beim Hochladen: " + err.message);
    }
  };

  const handleShareCurrent = async () => {
    const nr = viewingInvoice?.invoiceMeta?.nummer || "X";
    const elementId = previewTab === "behandlung" ? "invoice-treatment-doc-preview" : previewTab === "honorar" ? "hv-preview" : "invoice-preview";
    const filename = previewTab === "behandlung" ? `Behandlungsdokumentation_${nr}.pdf` : previewTab === "honorar" ? `Honorarvereinbarung_${nr}.pdf` : `Rechnung_${nr}.pdf`;
    try {
      const result = await generatePDFBlob(elementId);
      if (!result) return;
      const { pdf } = result;
      // Append treatment doc as page 2 for invoices (not HV/behandlung) when flag is set
      if (previewTab === "rechnung" && viewingInvoice?.attachTreatmentPdf && viewingInvoice?.treatmentDoc) {
        await appendPageToPDF(pdf, "invoice-treatment-doc-preview");
      }
      const blob = pdf.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        trackEvent("pdf_shared", { type: previewTab }, session?.access_token);
        await navigator.share({ files: [file], title: filename });
      } else {
        trackEvent("pdf_downloaded", { type: previewTab }, session?.access_token);
        pdf.save(filename);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Share failed:", e);
        showErrorToast("PDF konnte nicht erstellt werden: " + (e?.message || e));
      }
    }
  };

  const handlePrintCurrentDoc = () => {
    const nr = viewingInvoice?.invoiceMeta?.nummer || "X";
    const elementId = previewTab === "behandlung" ? "invoice-treatment-doc-preview" : previewTab === "honorar" ? "hv-preview" : "invoice-preview";
    const title = previewTab === "behandlung" ? `Behandlungsdokumentation ${nr}` : previewTab === "honorar" ? `Honorarvereinbarung ${nr}` : `Rechnung ${nr}`;
    trackEvent("pdf_printed", { type: previewTab }, session?.access_token);
    printElement(elementId, title);
  };

  const handleViewHV = (inv) => {
    setPreviewTab("honorar");
    navigateToPreview(inv);
  };

  const handlePrintHV = (inv) => {
    setPreviewTab("honorar");
    navigateToPreview(inv);
    setTimeout(() => printElement("hv-preview", `Honorarvereinbarung ${inv.invoiceMeta.nummer}`), 100);
  };

  // Generate PDF blob from element (handles hidden elements on mobile)
  const generatePDFBlob = async (elementId) => {
    let el = document.getElementById(elementId);
    if (!el) return null;
    // If element or parent is hidden (display:none), temporarily make it visible offscreen for capture
    const hiddenParents = [];
    let node = el;
    while (node && node !== document.body) {
      if (window.getComputedStyle(node).display === "none") {
        hiddenParents.push({ node, prev: node.style.cssText });
        node.style.cssText += ";display:block !important;position:absolute !important;left:-9999px !important;top:0 !important;";
      }
      node = node.parentElement;
    }
    // Drawing an SVG (or cross-origin) image onto a canvas taints it in Firefox,
    // which makes canvas.toDataURL throw a SecurityError. On that failure we retry
    // while skipping non-raster images (e.g. an SVG practice logo) so the user still
    // gets a PDF instead of a button that silently does nothing.
    const isSafeRasterImg = (n) => /^data:image\/(png|jpe?g|gif|webp|bmp)/i.test(n.getAttribute?.("src") || "");
    const capture = async (extraOpts) => {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff", ...extraOpts });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      return { pdf, blob: pdf.output("blob") };
    };
    try {
      try {
        return await capture({});
      } catch (e) {
        if (e && (e.name === "SecurityError" || /taint/i.test(e.message || ""))) {
          console.warn("PDF capture tainted by an image (likely an SVG logo in Firefox); retrying without non-raster images.", e);
          return await capture({ ignoreElements: (n) => n.tagName === "IMG" && !isSafeRasterImg(n) });
        }
        throw e;
      }
    } finally {
      hiddenParents.forEach(({ node: n, prev }) => { n.style.cssText = prev; });
    }
  };

  // Append a second page (from another DOM element) to an existing jsPDF instance
  const appendPageToPDF = async (pdf, elementId) => {
    let el = document.getElementById(elementId);
    if (!el) return;
    const hiddenParents = [];
    let node = el;
    while (node && node !== document.body) {
      if (window.getComputedStyle(node).display === "none") {
        hiddenParents.push({ node, prev: node.style.cssText });
        node.style.cssText += ";display:block !important;position:absolute !important;left:-9999px !important;top:0 !important;";
      }
      node = node.parentElement;
    }
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
      const imgData = canvas.toDataURL("image/png");
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
    } finally {
      hiddenParents.forEach(({ node: n, prev }) => { n.style.cssText = prev; });
    }
  };

  // Generate a multi-page A4 PDF by capturing each [data-pdf-page] element as a separate page,
  // or by flowing content across pages with header/footer when data-pdf-mode="flow" is set.
  const generateMultiPagePDF = async (elementId) => {
    let el = document.getElementById(elementId);
    if (!el) return null;
    // Temporarily remove risk highlights so they don't appear in the PDF
    const riskEls = el.querySelectorAll(".risk-highlight");
    const savedStyles = [];
    riskEls.forEach(re => { savedStyles.push(re.style.cssText); re.style.background = "transparent"; re.style.color = ""; re.querySelectorAll("td").forEach(td => { td.style.color = ""; }); });
    const restoreRiskHighlights = () => { riskEls.forEach((re, i) => { re.style.cssText = savedStyles[i] || ""; }); };
    const hiddenParents = [];
    let node = el;
    while (node && node !== document.body) {
      if (window.getComputedStyle(node).display === "none") {
        hiddenParents.push({ node, prev: node.style.cssText });
        node.style.cssText += ";display:block !important;position:absolute !important;left:-9999px !important;top:0 !important;";
      }
      node = node.parentElement;
    }
    try {
      // ── Flow mode: slice one tall content canvas across pages with header/footer ──
      if (el.dataset.pdfMode === "flow") {
        const headerEl = el.querySelector("[data-pdf-header]");
        const footerEl = el.querySelector("[data-pdf-footer]");
        const contentEl = el.querySelector("[data-pdf-content]");
        if (!contentEl) return null;

        // Make hidden templates visible for capture
        const prevH = headerEl.style.cssText;
        const prevF = footerEl.style.cssText;
        headerEl.style.cssText = "position:absolute;left:-9999px;top:0;width:210mm;padding:30px 44px 0 44px;background:white;box-sizing:border-box;display:block;";
        footerEl.style.cssText = "position:absolute;left:-9999px;top:0;width:210mm;padding:0 44px 30px 44px;background:white;box-sizing:border-box;display:block;";

        const scale = 2;
        const headerCanvas = await html2canvas(headerEl, { scale, useCORS: true, backgroundColor: "#fff" });
        const footerCanvas = await html2canvas(footerEl, { scale, useCORS: true, backgroundColor: "#fff" });
        const contentCanvas = await html2canvas(contentEl, { scale, useCORS: true, backgroundColor: "#fff" });

        headerEl.style.cssText = prevH;
        footerEl.style.cssText = prevF;

        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfW = pdf.internal.pageSize.getWidth(); // 210mm
        const pdfH = pdf.internal.pageSize.getHeight(); // 297mm

        // Convert canvas pixel heights to mm (at our capture scale, the element width = 210mm)
        const pxPerMm = contentCanvas.width / 210;
        const headerHmm = headerCanvas.height / pxPerMm;
        const footerHmm = footerCanvas.height / pxPerMm;
        const contentHmm = contentCanvas.height / pxPerMm;
        const availablePerPage = pdfH - headerHmm - footerHmm;
        const totalPdfPages = Math.ceil(contentHmm / availablePerPage);

        for (let p = 0; p < totalPdfPages; p++) {
          if (p > 0) pdf.addPage();

          // Draw header
          const headerImg = headerCanvas.toDataURL("image/png");
          pdf.addImage(headerImg, "PNG", 0, 0, pdfW, headerHmm);

          // Draw page number over header placeholder
          pdf.setFontSize(7);
          pdf.setTextColor(153, 153, 153);
          pdf.text(`Seite ${p + 1} von ${totalPdfPages}`, pdfW - 44, 34, { align: "right" });

          // Draw content slice
          const sliceTopPx = p * availablePerPage * pxPerMm;
          const sliceHeightPx = Math.min(availablePerPage * pxPerMm, contentCanvas.height - sliceTopPx);
          const sliceHmm = sliceHeightPx / pxPerMm;

          // Create a temporary canvas for this slice
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = contentCanvas.width;
          sliceCanvas.height = Math.ceil(sliceHeightPx);
          const ctx = sliceCanvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(contentCanvas, 0, sliceTopPx, contentCanvas.width, sliceHeightPx, 0, 0, contentCanvas.width, sliceHeightPx);

          const sliceImg = sliceCanvas.toDataURL("image/png");
          pdf.addImage(sliceImg, "PNG", 0, headerHmm, pdfW, sliceHmm);

          // Draw footer
          const footerImg = footerCanvas.toDataURL("image/png");
          pdf.addImage(footerImg, "PNG", 0, pdfH - footerHmm, pdfW, footerHmm);
        }

        return { pdf, blob: pdf.output("blob") };
      }

      // ── Page mode: each [data-pdf-page] is a separate page ──
      const pages = el.querySelectorAll("[data-pdf-page]");
      if (!pages || pages.length === 0) {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
        return { pdf, blob: pdf.output("blob") };
      }
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#fff" });
        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      }
      return { pdf, blob: pdf.output("blob") };
    } finally {
      restoreRiskHighlights();
      hiddenParents.forEach(({ node: n, prev }) => { n.style.cssText = prev; });
    }
  };

  // Share or download PDF depending on device capability
  const shareOrDownloadPDF = async (elementId, filename, extraPageElementId) => {
    const result = await generatePDFBlob(elementId);
    if (!result) return;
    const { pdf } = result;
    // Optionally append a second page (e.g., treatment doc)
    if (extraPageElementId) {
      await appendPageToPDF(pdf, extraPageElementId);
    }
    const blob = pdf.output("blob");
    const file = new File([blob], filename, { type: "application/pdf" });
    const isMobile = window.innerWidth < 640;
    if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); } catch (e) { if (e.name !== "AbortError") pdf.save(filename); }
    } else {
      pdf.save(filename);
    }
  };

  const handleDownloadInvoice = (inv) => {
    const prevViewing = viewingInvoice;
    setViewingInvoice(inv);
    setPreviewTab("rechnung");
    navigate(`/rechnungen/${inv._supabaseId || String(inv.id)}`);
    setTimeout(async () => {
      await shareOrDownloadPDF("invoice-preview", `Rechnung_${inv.invoiceMeta.nummer}.pdf`);
      navigate(-1);
      setViewingInvoice(prevViewing);
    }, 200);
  };

  const handleDownloadHV = (inv) => {
    const prevViewing = viewingInvoice;
    setViewingInvoice(inv);
    setPreviewTab("honorar");
    navigate(`/honorarvereinbarungen/${inv._supabaseId || String(inv.id)}`);
    setTimeout(async () => {
      await shareOrDownloadPDF("hv-preview", `Honorarvereinbarung_${inv.invoiceMeta.nummer}.pdf`);
      navigate(-1);
      setViewingInvoice(prevViewing);
    }, 200);
  };

  const handleViewTD = (inv) => {
    setPreviewTab("behandlung");
    navigateToPreview(inv);
  };

  const handleDownloadTD = (inv) => {
    const prevViewing = viewingInvoice;
    setViewingInvoice(inv);
    setPreviewTab("behandlung");
    navigate(`/behandlungen/${inv._supabaseId || String(inv.id)}`);
    setTimeout(async () => {
      const td = inv.treatmentDoc || {};
      const dateStr = td.behandlungsDatum || inv.invoiceMeta.datum || new Date().toISOString().slice(0, 10);
      const patName = [(inv.patient || {}).vorname || "", (inv.patient || {}).nachname || ""].filter(Boolean).join("_") || "Patient";
      await shareOrDownloadPDF("invoice-treatment-doc-preview", `Behandlung_${patName}_${dateStr}.pdf`);
      navigate(-1);
      setViewingInvoice(prevViewing);
    }, 200);
  };

  const handlePrintTD = (inv) => {
    setPreviewTab("behandlung");
    navigateToPreview(inv);
    const td = inv.treatmentDoc || {};
    const dateStr = td.behandlungsDatum || inv.invoiceMeta.datum || "";
    setTimeout(() => printElement("invoice-treatment-doc-preview", `Behandlungsdokumentation ${dateStr}`), 100);
  };

  // ─── Show auth screens if not logged in ───
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <div className="text-center">
          <div className="mb-3 flex justify-center"><img src="/logo-centered.svg" alt="EPHIA by Dr. Sophia" style={{ width: "128px" }} /></div>
          <p className="text-xs text-gray-400">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authPage === "signup") {
      return (
        <SignUpScreen
          onSignUpClick={handleSignUp}
          onBackClick={() => { setAuthPage("login"); setAuthError(""); setAuthSuccess(false); }}
          isLoading={authLoading}
          error={authError}
          success={authSuccess}
          successEmail={authSuccessEmail}
        />
      );
    }
    if (authPage === "reset") {
      return (
        <ResetPasswordScreen
          onResetClick={handleResetPassword}
          onBackClick={() => { setAuthPage("login"); setAuthError(""); setAuthSuccess(false); }}
          isLoading={authLoading}
          error={authError}
          success={authSuccess}
        />
      );
    }
    if (authPage === "set_new_password") {
      return (
        <SetNewPasswordScreen
          onSubmit={async (newPassword) => {
            setAuthError("");
            setAuthSuccess(false);
            setAuthLoading(true);
            try {
              // Use recovery access token to set new password
              const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${recoveryAccessToken}` },
                body: JSON.stringify({ password: newPassword }),
              });
              const updateData = await updateRes.json();
              if (!updateRes.ok) { throw new Error(updateData.message || updateData.msg || "Fehler beim Setzen des Passworts"); }

              // Re-wrap MEK using recovery key if available
              try {
                const userId = updateData.id;
                // Fetch profile to get recovery key
                const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${pgv(userId)}&select=*`, {
                  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${recoveryAccessToken}` },
                });
                const profiles = await profRes.json();
                if (profiles.length > 0) {
                  const profile = profiles[0];
                  if (profile.recovery_key && profile.recovery_wrapped_mek && profile.recovery_iv) {
                    // Unwrap MEK with recovery key
                    const rkRaw = base64ToBuf(profile.recovery_key);
                    const rk = await crypto.subtle.importKey("raw", rkRaw, "AES-GCM", false, ["decrypt"]);
                    const mek = await unwrapMEK(profile.recovery_wrapped_mek, profile.recovery_iv, rk);

                    // Re-wrap MEK with new password
                    const newSalt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
                    const newPdk = await derivePDK(newPassword, newSalt);
                    const { ciphertext: newWrapped, iv: newIv } = await encryptData(
                      btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("raw", mek)))),
                      newPdk
                    );

                    // Generate new recovery key
                    const newRkRaw = crypto.getRandomValues(new Uint8Array(32));
                    const newRk = await crypto.subtle.importKey("raw", newRkRaw, "AES-GCM", false, ["encrypt"]);
                    const mekRawExport = await crypto.subtle.exportKey("raw", mek);
                    const mekB64 = btoa(String.fromCharCode(...new Uint8Array(mekRawExport)));
                    const { ciphertext: newRecWrapped, iv: newRecIv } = await encryptData(mekB64, newRk);

                    await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${pgv(userId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${recoveryAccessToken}` },
                      body: JSON.stringify({
                        mek_wrapped: newWrapped, mek_iv: newIv, mek_salt: newSalt,
                        recovery_wrapped_mek: newRecWrapped, recovery_iv: newRecIv,
                        recovery_key: bufToBase64(newRkRaw),
                      }),
                    });
                  }
                }
              } catch (e) {
                console.error("Failed to re-wrap MEK during recovery:", e);
              }

              setRecoveryAccessToken(null);
              setAuthSuccess(true);
            } catch (err) {
              setAuthError(err.message || "Fehler beim Setzen des Passworts.");
            } finally {
              setAuthLoading(false);
            }
          }}
          onBackClick={() => { setAuthPage("login"); setAuthError(""); setAuthSuccess(false); setRecoveryAccessToken(null); }}
          isLoading={authLoading}
          error={authError}
          success={authSuccess}
        />
      );
    }
    if (authPage === "agb") {
      return <AGBPage onBack={() => setAuthPage("login")} />;
    }
    if (authPage === "impressum") {
      return <ImpressumPage onBack={() => setAuthPage("login")} />;
    }
    if (authPage === "datenschutz") {
      return <DatenschutzPage onBack={() => setAuthPage("login")} />;
    }
    return (
      <LoginScreen
        onSignInClick={(email, password) => {
          setAuthError("");
          handleSignIn(email, password);
        }}
        onSignUpClick={() => {
          setAuthError("");
          setAuthPage("signup");
        }}
        onResetClick={() => {
          setAuthError("");
          setAuthSuccess(false);
          setAuthPage("reset");
        }}
        onAGBClick={() => setAuthPage("agb")}
        onImpressumClick={() => setAuthPage("impressum")}
        onDatenschutzClick={() => setAuthPage("datenschutz")}
        isLoading={authLoading}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F8FA]" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", overflowX: "clip" }}>
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none} .hide-scrollbar{scrollbar-width:none;-ms-overflow-style:none} @keyframes plz-flash{0%{background-color:#d1fae5}100%{background-color:transparent}} .plz-autofilled{animation:plz-flash 1.2s ease-out}`}</style>
      {/* ─── Top bar ─── */}
      {!isConsentPage && <div className="bg-white border-b border-[#DFE3EB] px-3 sm:px-6 py-2 sm:py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/patients")} className="hover:opacity-70 transition flex-shrink-0"><img src="/logo.svg" alt="EPHIA" style={{ height: "28px" }} className="sm:hidden" /><img src="/logo.svg" alt="EPHIA" style={{ height: "33px" }} className="hidden sm:block" /></button>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <button
              className={`text-xs px-2 sm:px-3 py-1.5 rounded border transition ${pathname === "/patients" || pathname === "/" || isPatientDetail || isCreatePage ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 hover:text-gray-700 border-[#DFE3EB] hover:bg-gray-50"}`}
              onClick={() => navigate("/patients")}
            >
              <span className="sm:hidden"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span><span className="hidden sm:inline">Patient:innen</span>
            </button>
            {patients.length > 0 && (<button
              className={`text-xs px-2 sm:px-3 py-1.5 rounded border transition ${isListPage || isPreviewPage || isConsentPage ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 hover:text-gray-700 border-[#DFE3EB] hover:bg-gray-50"}`}
              onClick={() => navigate("/rechnungen")}
            >
              <span className="sm:hidden"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></span><span className="hidden sm:inline">Dokumente</span>
            </button>)}
            <button
              className={`text-xs px-2 sm:px-3 py-1.5 rounded border transition ${isVoucherListPage || isVoucherCreatePage || isVoucherPreviewPage ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 hover:text-gray-700 border-[#DFE3EB] hover:bg-gray-50"}`}
              onClick={() => navigate("/gutscheine")}
            >
              <span className="sm:hidden"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-6V2" /></svg></span><span className="hidden sm:inline">Gutscheine</span>
            </button>
            <div className="border-l border-[#DFE3EB] h-5 mx-0.5 sm:mx-1 hidden sm:block"></div>
            <button
              className="text-xs px-2 sm:px-3 py-1.5 rounded border transition text-gray-500 hover:text-gray-700 border-[#DFE3EB] hover:bg-gray-50"
              onClick={() => setShowSettings(true)}
            >
              <span className="sm:hidden"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span><span className="hidden sm:inline">Praxis-Einstellungen</span>
            </button>
            <button
              className="text-xs px-2 sm:px-3 py-1.5 rounded border border-[#DFE3EB] text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition"
              onClick={handleSignOut}
            >
              <span className="sm:hidden"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></span><span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </div>}

      {/* Delete modal */}
      {confirmDeleteId && (() => {
        const delInv = invoices.find((i) => i.id === confirmDeleteId);
        const delHasHV = delInv && !delInv._hvOnly && !delInv._standalone && (delInv.hasHV != null ? delInv.hasHV : (delInv.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5));
        return (
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">{delInv?._consentForm ? "Aufklärungsbogen löschen?" : delInv?._hvOnly ? "Honorarvereinbarung löschen?" : "Rechnung löschen?"}</h3>
              <p className="text-xs text-gray-500 mb-4">
                {delInv?._consentForm
                  ? "Möchtest Du diesen Aufklärungsbogen wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
                  : delHasHV
                  ? `Rechnung Nr. ${delInv?.invoiceMeta.nummer} hat eine zugehörige Honorarvereinbarung. Möchtest Du beides löschen oder nur die Rechnung löschen und die HV behalten?`
                  : `Möchtest Du ${delInv?._hvOnly ? "diese Honorarvereinbarung" : `Rechnung Nr. ${delInv?.invoiceMeta.nummer}`} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
                }
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setConfirmDeleteId(null)}>Abbrechen</button>
                {delHasHV && (
                  <button className="px-3 py-1.5 text-xs rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100" onClick={confirmDeleteKeepHV}>Nur Rechnung löschen</button>
                )}
                <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete}>{delHasHV ? "Beides löschen" : "Löschen"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Voucher delete confirmation modal */}
      {confirmDeleteVoucher && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Gutschein löschen?</h3>
            <p className="text-xs text-gray-500 mb-4">
              Möchtest Du den Gutschein <span className="font-mono">{confirmDeleteVoucher.code}</span> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setConfirmDeleteVoucher(null)}>Abbrechen</button>
              <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={confirmVoucherDelete}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Consent form risk warning modal */}
      {consentWarningPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-5 sm:p-6 w-full max-w-sm sm:max-w-md">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.54 20h18.92a1 1 0 00.85-1.28l-8.6-14.86a1 1 0 00-1.72 0z" /></svg>
              <h3 className="text-sm font-semibold text-gray-800">Wichtiger Hinweis</h3>
            </div>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Dieser Aufklärungsbogen ersetzt nicht das persönliche Aufklärungsgespräch zwischen Ärzt:in und Patient:in. Das individuelle Gespräch ist das rechtlich entscheidende Element der Aufklärung. Der Bogen dient lediglich als Dokumentationshilfe und Ergänzung. Bitte prüfe, ob der Bogen den Anforderungen Deiner Praxis und der geltenden Rechtslage entspricht, und passe ihn gegebenenfalls an.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button className="px-3 py-2 sm:py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50 w-full sm:w-auto" onClick={() => setConsentWarningPatient(null)}>Abbrechen</button>
              <button className="px-3 py-2 sm:py-1.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700 font-medium w-full sm:w-auto" onClick={() => {
                const p = consentWarningPatient;
                setConsentWarningPatient(null);
                setConsentPatient(p);
                setConsentTemplate(CONSENT_TEMPLATES[0]);
                if (isPatientDetail && window.innerWidth >= 1024) {
                  setPatientCreateModal("aufklaerung");
                } else {
                  navigate("/aufklaerung/neu");
                }
              }}>Verstanden, fortfahren</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeletePatient && (() => {
        const pEmail = (confirmDeletePatient.data?.email || confirmDeletePatient.email || "").toLowerCase();
        const pDbId = confirmDeletePatient.id;
        const pInvoices = invoices.filter((inv) => {
          if (inv._patientDbId && pDbId) return inv._patientDbId === pDbId;
          const invEmail = (inv.patient?.email || "").toLowerCase();
          return pEmail && invEmail && invEmail === pEmail;
        });
        const pHVs = pInvoices.filter((inv) => inv.hasHV != null ? inv.hasHV : (inv.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5));
        const pName = [confirmDeletePatient.data?.vorname || confirmDeletePatient.vorname, confirmDeletePatient.data?.nachname || confirmDeletePatient.nachname].filter(Boolean).join(" ") || pEmail;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Patient:in löschen?</h3>
              <p className="text-xs text-gray-500 mb-4">
                <strong>{pName}</strong> und alle zugehörigen Rechnungen ({pInvoices.length}) und Honorarvereinbarungen ({pHVs.length}) werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 text-xs rounded border border-[#DFE3EB] text-gray-600 hover:bg-gray-50" onClick={() => setConfirmDeletePatient(null)}>Abbrechen</button>
                <button className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700" onClick={confirmDeletePatientAction}>Löschen</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Save toast */}
      {saveToast && (
        <div className={`fixed top-16 right-6 z-50 ${toastIsError ? "bg-red-600" : "bg-green-600"} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in`}>
          {toastIsError
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.54 20h18.92a1 1 0 00.85-1.28l-8.6-14.86a1 1 0 00-1.72 0z" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
          {saveToast}
        </div>
      )}

      <SettingsPanel practice={practice} setPractice={setPractice} show={showSettings} setShow={setShowSettings} onSave={savePracticeSettings} isFirstTime={isFirstTimeUser} session={session} currentMEK={currentMEK} userId={user?.id} patients={patients} invoices={invoices} behandlungen={behandlungen} setPatients={setPatients} setInvoices={setInvoices} />

      {/* Verdienst Popup */}
      {showVerdienst && (() => {
        const praeparatKosten = ganzeAmpulle ? ampullenpreis : ml * preisProMl;
        const sachkostenTotal = (sachkosten || []).reduce((sum, sk) => sum + parseDE(sk.betragStr), 0);
        const zuschlagTotal = (selectedZuschlaege || []).reduce((sum, code) => {
          const z = ZUSCHLAEGE.find((zs) => zs.code === code);
          return sum + (z ? calcGoaBetrag(z.punkte, 1.0) : 0);
        }, 0);
        const netto = zwischensumme;
        const liveMwst = noMwst ? 0 : Math.round(netto * 0.19 * 100) / 100;
        const liveGesamt = Math.round((netto + liveMwst) * 100) / 100;
        const verdienst = netto - praeparatKosten - sachkostenTotal;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center" onClick={() => setShowVerdienst(false)}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">{hvOnlyMode ? "Dein geplanter Verdienst" : "Dein Verdienst"}</h3>
                <button className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setShowVerdienst(false)}>✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Gesamtbetrag (Rechnung)</span>
                  <span className="font-medium text-gray-700">{fmt(liveGesamt).replace(".", ",")} €</span>
                </div>
                {!noMwst && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">MwSt. (19%)</span>
                    <span className="text-gray-700">− {fmt(liveMwst).replace(".", ",")} €</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">{ganzeAmpulle ? "Präparatkosten (1 Ampulle)" : `Präparatkosten (${mlStr || "0"} × ${preisProMlStr || "0"} €)`}</span>
                  <span className="text-gray-700">{praeparatKosten > 0 ? "−" : ""} {fmt(praeparatKosten).replace(".", ",")} €</span>
                </div>
                {sachkostenTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Weitere Sachkosten</span>
                    <span className="text-gray-700">− {fmt(sachkostenTotal).replace(".", ",")} €</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-800">{hvOnlyMode ? "Dein geplanter Verdienst" : "Dein Verdienst"}</span>
                  <span className="font-semibold text-gray-800">{fmt(verdienst).replace(".", ",")} €</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">Vor Einkommensteuer.</p>
            </div>
          </div>
        );
      })()}

      {pathname === "/agb" && <AGBPage onBack={() => navigate("/patients")} />}
      {pathname === "/impressum" && <ImpressumPage onBack={() => navigate("/patients")} />}
      {pathname === "/datenschutz" && <DatenschutzPage onBack={() => navigate("/patients")} />}

      {!isKnownRoute && <NotFoundPage />}

      {/* Full-page consent flow: intentionally NOT tied to the route, so the view
          (and the kiosk lock) survives back-button navigation without losing state */}
      {consentKioskActive && (
        <ConsentFormView
          template={consentTemplate}
          patient={consentPatient}
          practice={practice}
          kioskPin={kioskPin}
          onComplete={handleConsentComplete}
          onCancel={() => { setConsentPatient(null); setConsentTemplate(null); navigate(`/patients/${consentPatient?.id || selectedPatient?.id}`); }}
        />
      )}

      {/* Consent form modal (desktop patient detail) */}
      {patientCreateModal === "aufklaerung" && consentTemplate && consentPatient && (
        <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center py-6 px-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Neuer Aufklärungsbogen</h2>
                <button className="p-1 text-gray-400 hover:text-gray-600 transition" onClick={() => { setPatientCreateModal(null); setConsentPatient(null); setConsentTemplate(null); }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <ConsentFormView
                template={consentTemplate}
                patient={consentPatient}
                practice={practice}
                kioskPin={kioskPin}
                onComplete={handleConsentComplete}
                onCancel={() => { setPatientCreateModal(null); setConsentPatient(null); setConsentTemplate(null); }}
                isModal
              />
            </div>
          </div>
        </div>
      )}

      {/* Kiosk handback screen: shown after the patient completed/refused the consent
          form while a Praxis-PIN is set. Exiting to the app requires the PIN. */}
      {consentHandback && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-5 rounded-full bg-teal-50 flex items-center justify-center">
              <svg className="w-8 h-8 md:w-10 md:h-10 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-2">Vielen Dank!</h3>
            <p className="text-sm md:text-base text-gray-500 mb-8">
              Der Aufklärungsbogen wurde gespeichert. Bitte geben Sie das Gerät an Ihre:n Ärzt:in zurück.
            </p>
            <button
              className="w-full py-3 text-sm md:text-base font-medium rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition"
              onClick={() => setConsentHandbackPin(true)}
            >
              Weiter als Ärzt:in
            </button>
          </div>
        </div>
      )}
      {consentHandback && consentHandbackPin && (
        <PinGate
          pin={kioskPin}
          subtitle="Zum Fortfahren bitte die Praxis-PIN eingeben."
          onSuccess={() => finalizeConsentHandback(consentHandback)}
          onCancel={() => setConsentHandbackPin(false)}
        />
      )}

      {pathname !== "/agb" && pathname !== "/impressum" && pathname !== "/datenschutz" && !isConsentPage && <div className={`mx-auto py-3 sm:py-5 ${isPatientDetail ? "max-w-full px-4 sm:px-6 lg:px-8" : isCreatePage ? "max-w-7xl px-3 sm:px-6" : isListPage || pathname === "/patients" || pathname === "/" ? "max-w-6xl px-3 sm:px-6" : isPreviewPage || isVoucherPreviewPage ? "max-w-5xl px-3 sm:px-6" : "max-w-3xl px-3 sm:px-6"}`}>
        {/* ═══ CREATE PAGE ═══ */}
        {(isCreatePage || patientCreateModal === "rechnung" || patientCreateModal === "hv") && (
          <>
          {/* Modal backdrop + wrapper for patient detail mode */}
          {patientCreateModal && !showIndicationModal && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPatientCreateModal(null)} />}
          <div className={patientCreateModal ? "fixed inset-0 z-50 overflow-y-auto" : ""}>
          <div className={patientCreateModal ? "max-w-7xl mx-auto py-6 px-3 sm:px-6" : ""}>
          {patientCreateModal && !showIndicationModal && (
            <div className="flex justify-end mb-2">
              <button className="p-2 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition" onClick={() => setPatientCreateModal(null)}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          {/* ═══ Indication Type Modal ═══ */}
          {showIndicationModal && (
            <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
              <div className="relative bg-white rounded-xl shadow-2xl p-6 sm:p-8" style={{ maxWidth: 480, width: "100%" }}>
                <button
                  className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                  onClick={() => { setShowIndicationModal(false); setAmendingId(null); setHvOnlyMode(false); if (patientCreateModal) { setPatientCreateModal(null); } else { navigate("/rechnungen"); } }}
                  aria-label="Abbrechen"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h3 className="text-base font-semibold text-gray-800 mb-1 pr-8">Art der Abrechnung</h3>
                <p className="text-xs text-gray-400 mb-5">Wähle, ob die Rechnung für eine ästhetische oder therapeutische Indikation erstellt werden soll.</p>
                <div className="flex flex-col gap-3">
                  <button
                    className="flex items-center gap-3 p-4 rounded-lg border-2 border-[#DFE3EB] hover:border-blue-400 hover:bg-blue-50 transition text-left group"
                    onClick={() => { setIndicationType("aesthetic"); setDiagnose(""); setShowIndicationModal(false); }}
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800 group-hover:text-blue-700">Ästhetische Indikation</div>
                      <div className="text-xs text-gray-400">Selbstzahler-Rechnung ohne Diagnose</div>
                    </div>
                  </button>
                  <button
                    className="flex items-center gap-3 p-4 rounded-lg border-2 border-[#DFE3EB] hover:border-blue-400 hover:bg-blue-50 transition text-left group"
                    onClick={() => { setIndicationType("medical"); setShowIndicationModal(false); }}
                  >
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800 group-hover:text-blue-700">Therapeutische Indikation</div>
                      <div className="text-xs text-gray-400">Rechnung mit Diagnose (z. B. für Private Krankenkasse)</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
          {!showIndicationModal && (
          <div className="flex gap-6 items-start">
          {/* Left side: Form */}
          <div className="w-full lg:w-[400px] flex-shrink-0 bg-white rounded-lg border border-[#DFE3EB] p-4 sm:p-6">
            {createForPatient && !amendingId && (
              <button className="text-xs text-gray-400 hover:text-gray-600 mb-2" onClick={() => { if (patientCreateModal) { setPatientCreateModal(null); return; } setCreateForPatient(null); navigate(createSource === "list" ? "/rechnungen" : `/patients/${createForPatient?.id}`); }}>{patientCreateModal ? `← Zurück zu ${patient.vorname} ${patient.nachname}` : createSource === "list" ? "← Zurück zu Dokumente" : `← Zurück zu ${patient.vorname} ${patient.nachname}`}</button>
            )}
            <h2 className="text-base font-semibold text-gray-800 mb-1">
              {hvOnlyMode
                ? (amendingId ? "Honorarvereinbarung ändern" : createForPatient ? `Honorarvereinbarung für ${patient.vorname} ${patient.nachname}` : "Neue Honorarvereinbarung")
                : (amendingId ? "Rechnung ändern" : createForPatient ? `Rechnung für ${patient.vorname} ${patient.nachname}` : "Botulinum-Rechnung erstellen")}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {hvOnlyMode
                ? (amendingId
                  ? "Passe die Daten an und speichere die geänderte Honorarvereinbarung."
                  : "Hinweis: Eine Honorarvereinbarung nach §2 GOÄ ist nur erforderlich, wenn der Steigerungssatz einer Leistung über 3,5 liegt.")
                : (amendingId
                  ? "Passe die Daten an und speichere die geänderte Rechnung."
                  : "Trag einfach die Behandlungsdetails ein. Deine Rechnung wird automatisch nach GOÄ erstellt.")}
            </p>
            {amendingId && !hvOnlyMode && effectiveMaxSteigerung > 3.5 && (
              <div className="mb-6 px-3 py-2 bg-gray-50 border border-[#DFE3EB] rounded text-xs text-gray-500">
                Änderungen werden auch in der zugehörigen Honorarvereinbarung übernommen.
              </div>
            )}

            {/* HV import banner */}
            {createForPatient && !hvOnlyMode && !amendingId && (() => {
              const pDbId = createForPatient?._raw?.id || createForPatient?.id || null;
              const pEmail = (createForPatient?.data?.email || createForPatient?.email || createForPatient?._raw?.data?.email || "").toLowerCase();
              // Find HVs belonging to this patient
              const patientHVs = invoices.filter((inv) => {
                if (!inv._hvOnly) return false;
                if (inv._patientDbId && pDbId) return inv._patientDbId === pDbId;
                const invEmail = (inv.patient?.email || "").toLowerCase();
                return pEmail && invEmail && invEmail === pEmail;
              });
              // An HV is "linked" if any regular invoice references it via _fromHvId
              const linkedHvIds = new Set(invoices.filter((inv) => inv._fromHvId && !inv._hvOnly && !inv._standalone).map((inv) => inv._fromHvId));
              const unlinkedHVs = patientHVs.filter((hv) => !linkedHvIds.has(hv.id));
              if (unlinkedHVs.length === 0) return null;

              const importFromHV = (hv) => {
                setPraeparat(hv.praeparat || "");
                setEinheit(hv.einheit || "SE");
                setMlStr(hv.mlStr || (hv.ml != null ? (hv.ml % 1 === 0 ? String(hv.ml) : hv.ml.toFixed(2).replace(".", ",")) : "1"));
                setPreisProMlStr(hv.preisProMlStr || (hv.preisProMl != null ? hv.preisProMl.toFixed(2).replace(".", ",") : ""));
                setGanzeAmpulle(!!hv.ganzeAmpulle);
                setAmpullenpreisStr(hv.ampullenpreisStr || (hv.ampullenpreis != null ? hv.ampullenpreis.toFixed(2).replace(".", ",") : ""));
                setSelectedZuschlaege(hv.selectedZuschlaege || []);
                setWunschGesamtStr(hv.wunschGesamtStr || "");
                setUseBeratungLang(hv.useBeratungLang || false);
                setBegruendung(hv.begruendung || "");
                if (hv.treatmentDoc && hv.treatmentDoc.markers && hv.treatmentDoc.markers.length > 0) {
                  setTreatmentMarkers(hv.treatmentDoc.markers.map((m, i) => ({ id: Date.now() + i, ...m })));
                  setTreatmentFacePhoto(hv.treatmentDoc.facePhoto || "");
                  setAttachTreatmentPdf(true);
                } else {
                  setTreatmentMarkers([]);
                  setTreatmentFacePhoto("");
                }
                // Store HV base values for cost deviation tracking
                const hvGesamt = parseDE(hv.wunschGesamtStr || "0");
                const hvMl = hv.ml != null ? hv.ml : parseDE(hv.mlStr || "0");
                const hvPpm = hv.preisProMl != null ? hv.preisProMl : parseDE(hv.preisProMlStr || "0");
                setHvBaseGesamt(hvGesamt > 0 ? hvGesamt : null);
                setHvBaseProductCost(hv.ganzeAmpulle ? Math.round((hv.ampullenpreis != null ? hv.ampullenpreis : parseDE(hv.ampullenpreisStr || "0")) * 100) / 100 : Math.round(hvMl * hvPpm * 100) / 100);
                setHvBaseSachkosten(0);
                setSachkosten([]);
                setFromHvId(hv.id);
              };

              return (
                <div className="mb-4 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-blue-800 mb-1.5">Honorarvereinbarung vorhanden</p>
                  <p className="text-xs text-blue-600 mb-2">Daten aus einer bestehenden HV übernehmen:</p>
                  <div className="space-y-1.5">
                    {unlinkedHVs.map((hv) => {
                      const hvDate = hv.invoiceMeta?.datum || "";
                      const hvPraep = hv.praeparat || "Unbekannt";
                      const hvMl = hv.mlStr || (hv.ml != null ? String(hv.ml) : "");
                      const hvPatientName = [hv.patient?.vorname, hv.patient?.nachname].filter(Boolean).join(" ");
                      return (
                        <button key={hv.id} className="w-full text-left px-2.5 py-1.5 bg-white border border-blue-200 rounded hover:bg-blue-100 transition-colors text-xs text-blue-800" onClick={() => importFromHV(hv)}>
                          {hvPatientName ? `${hvPatientName}, ` : ""}{hvPraep}, {hvMl} {hv.einheit || "SE"}{hvDate ? `, ${hvDate.split("-").reverse().join(".")}` : ""}
                        </button>
                      );
                    })}
                  </div>
                  {fromHvId && <p className="text-xs text-green-600 mt-2 font-medium">✓ Daten aus HV übernommen</p>}
                </div>
              );
            })()}

            {/* Rechnung meta */}
            <div className="mb-6 pb-5 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4">{hvOnlyMode ? "Honorarvereinbarung" : "Rechnung"}</p>
              <div className="space-y-4">
                <div className={`grid grid-cols-1 ${hvOnlyMode ? "" : "sm:grid-cols-2"} gap-4`}>
                  {!hvOnlyMode && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Rechnungsnummer *</label>
                    <input id="field-nummer" className={inputCls(validationErrors.nummerDuplicate ? "nummerDuplicate" : "nummer")} value={invoiceMeta.nummer} placeholder={(() => { const ri = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—"); if (ri.length === 0) return ""; const lt = ri.reduce((b, i) => { const t = i._createdAt || i.savedAt || ""; const bt = b._createdAt || b.savedAt || ""; return t > bt ? i : b; }, ri[0]); return nextInvoiceNumber(lt.invoiceMeta.nummer); })()} onChange={(e) => { setInvoiceMeta({ ...invoiceMeta, nummer: e.target.value }); clearError("nummer"); clearError("nummerDuplicate"); }} />
                    {validationErrors.nummerDuplicate && <p className="text-xs text-red-500 mt-0.5">Diese Rechnungsnummer existiert bereits.</p>}
                    {invoices.length > 0 && !amendingId && (() => {
                      const realInv = invoices.filter(i => i.invoiceMeta?.nummer && i.invoiceMeta.nummer !== "—");
                      if (realInv.length === 0) return null;
                      const latest = realInv.reduce((best, inv) => {
                        const t = inv._createdAt || inv.savedAt || "";
                        const bt = best._createdAt || best.savedAt || "";
                        return t > bt ? inv : best;
                      }, realInv[0]);
                      const suggested = nextInvoiceNumber(latest.invoiceMeta.nummer);
                      return (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Letzte: {latest.invoiceMeta.nummer}
                          {suggested && !invoiceMeta.nummer && <span> · <button type="button" className="text-blue-500 hover:text-blue-700" onClick={() => setInvoiceMeta({ ...invoiceMeta, nummer: suggested })}>{suggested} übernehmen</button></span>}
                        </p>
                      );
                    })()}
                  </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{hvOnlyMode ? "Datum der Behandlung" : "Datum"} *</label>
                    <input id="field-datum" type="date" className={inputCls("datum") + " bg-white text-left"} style={{ WebkitAppearance: "none", appearance: "none", colorScheme: "light" }} value={invoiceMeta.datum} onChange={(e) => { setInvoiceMeta({ ...invoiceMeta, datum: e.target.value }); clearError("datum"); }} />
                  </div>
                </div>
                <div className={`grid grid-cols-1 ${hvOnlyMode ? "" : "sm:grid-cols-2"} gap-4`}>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">Ort der Behandlung <InfoTooltip>Wird automatisch aus Deinen Praxiseinstellungen übernommen. Du kannst den Ort dort unter „Stadt (Behandlungsort)" ändern.</InfoTooltip></label>
                    <input id="field-ort" className={inputCls("ort")} value={invoiceMeta.ort} placeholder="Berlin" onChange={(e) => { setInvoiceMeta({ ...invoiceMeta, ort: e.target.value }); clearError("ort"); }} />
                  </div>
                  {!hvOnlyMode && (
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">Zahlungsfrist (Tage) <InfoTooltip>Standardwert aus den Praxiseinstellungen. Du kannst ihn hier für diese Rechnung anpassen.</InfoTooltip></label>
                    <input type="number" min="0" className="w-full border border-[#DFE3EB] rounded px-1.5 sm:px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={invoiceMeta.zahlungsfrist ?? ""} placeholder="14" onChange={(e) => setInvoiceMeta({ ...invoiceMeta, zahlungsfrist: e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0 })} />
                  </div>
                  )}
                </div>
              </div>
            </div>

            {/* Diagnose (medical indication) */}
            {!hvOnlyMode && indicationType === "medical" && (
              <div className="mb-6 pb-5 border-b border-gray-100">
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Diagnose (Therapeutische Indikation)</p>
                </div>
                <div className="relative">
                  <input
                    className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={diagnose}
                    placeholder="z. B. Bruxismus (F45.8)"
                    onChange={(e) => setDiagnose(e.target.value)}
                    autoComplete="off"
                  />
                  {(() => {
                    const q = diagnose.toLowerCase().trim();
                    if (!q || q.length < 2) return null;
                    const matches = ICD10_CODES.filter(c =>
                      c.diagnosis.toLowerCase().includes(q) ||
                      c.icd10.toLowerCase().includes(q) ||
                      c.keywords.some(k => k.includes(q))
                    ).slice(0, 5);
                    if (matches.length === 0) return null;
                    // Don't show if already exactly selected
                    if (matches.length === 1 && diagnose === `${matches[0].diagnosis} (${matches[0].icd10})`) return null;
                    return (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#DFE3EB] rounded-lg shadow-lg z-10 overflow-hidden">
                        {matches.map((c) => (
                          <button
                            key={c.icd10}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition border-b border-gray-50 last:border-0"
                            onClick={() => setDiagnose(`${c.diagnosis} (${c.icd10})`)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.icd10}</span>
                              <span className="text-sm font-medium text-gray-800">{c.diagnosis}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  <svg className="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Wir empfehlen die Verwendung von ICD-10-Codes für eine reibungslose Erstattung bei der Privaten Krankenkasse.
                </p>
              </div>
            )}


            {/* Patient:in */}
            {!createForPatient && (
            <div className="mb-6 pb-5 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-4">Patient:in</p>
              {createForPatient ? null : (
                <>
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vorname *</label>
                  <input id="field-patientVorname" className={inputCls("patientVorname")} value={patient.vorname} placeholder="Max" onChange={(e) => { setPatient({ ...patient, vorname: e.target.value }); clearError("patientVorname"); }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nachname *</label>
                  <input id="field-patientNachname" className={inputCls("patientNachname")} value={patient.nachname} placeholder="Mustermann" onChange={(e) => { setPatient({ ...patient, nachname: e.target.value }); clearError("patientNachname"); }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-Mail</label>
                <input id="field-patientEmail" type="email" className={inputCls("patientEmail")} value={patient.email} placeholder="max@beispiel.de" onChange={(e) => { setPatient({ ...patient, email: e.target.value }); clearError("patientEmail"); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
                <input type="tel" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={patient.phone} placeholder="+49 123 456789" onChange={(e) => setPatient({ ...patient, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Straße & Hausnummer</label>
                <input id="field-patientAddress1" className={inputCls("patientAddress1")} value={patient.address1} placeholder="Musterstraße 5" onChange={(e) => { setPatient({ ...patient, address1: e.target.value }); clearError("patientAddress1"); }} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">PLZ</label>
                  <input id="field-patientAddress2" className={inputCls("patientAddress2")} value={parsePlzOrt(patient.address2).plz} placeholder="10117" maxLength={5} inputMode="numeric" onChange={(e) => { const v = e.target.value; const { ort } = parsePlzOrt(patient.address2); setPatient({ ...patient, address2: combinePlzOrt(v, ort) }); clearError("patientAddress2"); if (v.length === 5 && !ort && (!patient.country || patient.country === "Deutschland")) lookupPlz(v).then(city => { if (city) { setPatient(p => ({ ...p, address2: combinePlzOrt(v, parsePlzOrt(p.address2).ort || city) })); const ortEl = e.target.closest(".grid")?.querySelector("[data-ort-field]"); flashOrtField(ortEl); } }); }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ort</label>
                  <input data-ort-field className={inputCls("patientAddress2")} value={parsePlzOrt(patient.address2).ort} placeholder="Berlin" onChange={(e) => { const { plz } = parsePlzOrt(patient.address2); setPatient({ ...patient, address2: combinePlzOrt(plz, e.target.value) }); clearError("patientAddress2"); }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Land</label>
                <select
                    className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    value={patient.country}
                    onChange={(e) => setPatient({ ...patient, country: e.target.value })}
                  >
                    {PRIORITY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option disabled>────────────</option>
                    {OTHER_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {patient.country !== "Deutschland" && (
                    <p className="text-xs text-gray-500 mt-1">Kein inländischer Wohnsitz: MwSt. entfällt.</p>
                  )}
              </div>
              </div>
                </>
              )}
            </div>
            )}

            {/* ─── GOÄ 3 toggle ─── */}
            {!hvOnlyMode && (
            <div className="mb-6 pb-5 border-b border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 flex-shrink-0 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={useBeratungLang} onChange={(e) => setUseBeratungLang(e.target.checked)} />
                <span className="text-xs text-gray-600">Beratung &gt; 10 Min. <span className="text-gray-400">(GOÄ 3 statt GOÄ 1)</span></span>
              </label>
            </div>
            )}

            {/* Treatment inputs */}
            <div className="mb-6 pb-5 border-b border-gray-100">
              <div className="flex items-center gap-1 mb-4">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Verwendetes Präparat</p>
                <InfoTooltip wide>
                  <div>
                    <strong>Hinweis nach GOÄ §10 (Auslagen):</strong> Es dürfen nur die tatsächlich entstandenen Kosten berechnet werden, nicht der aktuelle Marktpreis, sondern der Einkaufspreis. Rabatte und Boni müssen an Patient:innen weitergegeben werden; Pauschalen sind nicht erlaubt.{"\n\n"}Ab einem Betrag von 25,56 € ist ein Beleg (z.B. Einkaufsrechnung, Lieferschein) beizufügen. Belege mit mehreren Posten sind zulässig, sofern der Einzelpreis des verwendeten Materials klar hervorgeht.{"\n\n"}<strong>Tipp:</strong> Häufig verwendete Präparate kannst Du in den Praxis-Einstellungen speichern, um sie hier schnell auszuwählen.
                  </div>
                </InfoTooltip>
              </div>
              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Präparatsname *</label>
                  <PraeparatAutocomplete
                    id="field-praeparat"
                    className={inputCls("praeparat")}
                    value={praeparat}
                    placeholder="z.B. Bocouture, Botox"
                    suggestions={(practice.praeparate || []).filter(p => p.name)}
                    onChange={(v) => { setPraeparat(v); clearError("praeparat"); }}
                    onSelect={(p) => {
                      setPraeparat(p.name); clearError("praeparat");
                      if (p.einheit) setEinheit(p.einheit);
                      if (p.preisStr) { setPreisProMlStr(p.preisStr); clearError("preisProMl"); }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Einheit</label>
                  <select className="w-full border border-[#DFE3EB] rounded px-1.5 sm:px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
                    <option value="ml">ml</option>
                    <option value="SE">SE</option>
                    <option value="IE">IE</option>
                  </select>
                </div>
              </div>
              {/* ── Behandlungsdokumentation / Injektionsplanung (inside Präparat) ── */}
              <div>
                <TreatmentMap markers={treatmentMarkers} setMarkers={setTreatmentMarkers} einheit={einheit} facePhoto={treatmentFacePhoto} onFacePhotoChange={setTreatmentFacePhoto} planMode={hvOnlyMode} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{hvOnlyMode ? "Geplante Menge" : "Menge"} *</label>
                  <input id="field-ml" type="text" inputMode="decimal" className={inputCls("ml")} value={mlStr} placeholder="0,45" onChange={(e) => { const v = e.target.value.replace(/[^\d,.+*×x\- ]/g, ""); setMlStr(v); clearError("ml"); }} />
                </div>
                {ganzeAmpulle ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ampullenpreis (€) *</label>
                    <input id="field-ampullenpreis" type="text" inputMode="decimal" className={inputCls("ampullenpreis")} value={ampullenpreisStr} placeholder="z.B. 64,00" onChange={(e) => { const v = e.target.value.replace(/[^\d,.+*×x\- ]/g, ""); setAmpullenpreisStr(v); clearError("ampullenpreis"); }} />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1"><span className="hidden sm:inline">Preis / </span><span className="sm:hidden">€ / </span>{einheit}<span className="hidden sm:inline"> (€)</span> *</label>
                    <input id="field-preisProMl" type="text" inputMode="decimal" className={inputCls("preisProMl")} value={preisProMlStr} placeholder="" onChange={(e) => { const v = e.target.value.replace(/[^\d,.+*×x\- ]/g, ""); setPreisProMlStr(v); clearError("preisProMl"); }} />
                  </div>
                )}
              </div>
              {/* ── Ganze Ampulle berechnen (Verwurf) ── */}
              <div className="flex items-start gap-2">
                <input id="field-ganzeAmpulle" type="checkbox" className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={ganzeAmpulle} onChange={(e) => { setGanzeAmpulle(e.target.checked); clearError("preisProMl"); clearError("ampullenpreis"); }} />
                <label htmlFor="field-ganzeAmpulle" className="text-sm text-gray-700 cursor-pointer select-none">
                  Ganze Ampulle berechnen
                  <span className="block text-xs text-gray-400">Berechnet den vollen Ampullenpreis, unabhängig von der injizierten Menge (Verwurf nach GOÄ §10).</span>
                </label>
              </div>
              </div>
            </div>

            {/* ── Sachkosten ── */}
            {!hvOnlyMode && (
            <div className="mb-6 pb-5 border-b border-gray-100">
              <div className="flex items-center gap-1 mb-3">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Weitere Sachkosten</p>
                <InfoTooltip wide>
                  <div style={{ whiteSpace: "pre-line" }}>{SACHKOSTEN_INFO}</div>
                </InfoTooltip>
              </div>
              {sachkosten.map((sk) => (
                <div key={sk.id} className="flex gap-3 items-center mt-2">
                  <input className="flex-1 px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm focus:ring-2 focus:ring-gray-300 outline-none" placeholder="z.B. Kühlbeutel z. Mitnahme" value={sk.description} onChange={(e) => updateSachkosten(sk.id, "description", e.target.value)} />
                  <input className="w-28 px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm text-right focus:ring-2 focus:ring-gray-300 outline-none" placeholder="z.B. 4,50" value={sk.betragStr} onChange={(e) => updateSachkosten(sk.id, "betragStr", e.target.value)} />
                  <button className="text-gray-400 hover:text-red-500 transition" onClick={() => removeSachkosten(sk.id)} title="Entfernen">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button className="flex items-center gap-1.5 mt-2 text-sm text-blue-500 hover:text-blue-700 font-medium transition py-1.5" onClick={addSachkosten}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Weitere Sachkosten hinzufügen
              </button>
            </div>
            )}

            {/* ── Gutschein einlösen ── */}
            {!hvOnlyMode && (
              <VoucherRedeemField
                applied={appliedVoucher}
                gesamt={gesamt}
                onApply={handleApplyVoucher}
                onClear={handleClearVoucher}
                error={voucherLookupError}
                looking={voucherLooking}
              />
            )}

            {/* ─── Zuschläge ─── */}
            <div className="mb-6 pb-5 border-b border-gray-100">
              <div className="flex items-center gap-1 mb-3">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Zuschläge <span className="normal-case font-normal">(nach GOÄ Abschnitt B)</span></p>
                <InfoTooltip>
                  <div>
                    <strong>GOÄ-Zuschläge</strong> können für Leistungen außerhalb der regulären Sprechstundenzeit berechnet werden. Sie gelten für die Ziffern 1 und 5 und sind nicht steigerbar (Faktor 1,0).{"\n\n"}
                    <a href="https://abrechnungsstelle.com/goae-zuschlaege/" target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", textDecoration: "underline" }}>
                      Mehr Informationen zu GOÄ-Zuschlägen
                    </a>
                  </div>
                </InfoTooltip>
              </div>
              <div className="flex flex-wrap gap-2">
                {ZUSCHLAEGE.map((z) => {
                  const active = selectedZuschlaege.includes(z.code);
                  return (
                    <div key={z.code} className="flex items-center gap-0.5">
                      <button
                        className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                          active
                            ? "bg-blue-50 border-blue-300 text-blue-700"
                            : "border-[#DFE3EB] text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                        onClick={() => toggleZuschlag(z.code)}
                      >
                        <span>{z.label}</span>
                        <span className="ml-1.5 text-gray-400">({fmt(calcGoaBetrag(z.punkte, 1.0))} €)</span>
                      </button>
                      <InfoTooltip>
                        <div>
                          <div className="font-semibold mb-1">Zuschlag {z.code} · {z.punkte} Punkte · Faktor 1,0</div>
                          <div>{z.info}</div>
                          <div className="mt-1 text-gray-400">Gilt für GOÄ {z.appliesTo.join(", ")}</div>
                        </div>
                      </InfoTooltip>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desired total amount */}
            <div className="mb-6 pb-5 border-b border-gray-100">
              <div className="flex items-center gap-1 mb-4">
                <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Gewünschter Gesamtbetrag</p>
                <InfoTooltip>
                  <div>
                    Gib den gewünschten <strong>Gesamtbetrag</strong> {noMwst ? "" : "(inkl. MwSt.) "}ein. Der Steigerungssatz der GOÄ 267 wird automatisch so berechnet, dass die Rechnung diesen Betrag erreicht.{"\n\n"}
                    Lass das Feld leer, um den Standard-Steigerungssatz (3,5-fach) zu verwenden.
                  </div>
                </InfoTooltip>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Gesamtbetrag (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={wunschGesamtStr}
                  placeholder={fmt(defaultGesamt).replace(".", ",")}
                  onChange={(e) => setWunschGesamtStr(e.target.value)}
                />
              </div>
              {hvBaseGesamt != null && hvExtraBrutto > 0 && (
                <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  <p className="font-medium mb-1">Gesamtbetrag angepasst (+{fmt(hvExtraBrutto).replace(".", ",")} €)</p>
                  <p className="text-amber-600">
                    HV-Betrag: {fmt(hvBaseGesamt).replace(".", ",")} €
                    {Math.max(0, hvProductDelta) > 0 && <><br />+ Präparat-Mehrkosten: {fmt(Math.max(0, noMwst ? hvProductDelta : Math.round(hvProductDelta * 1.19 * 100) / 100)).replace(".", ",")} €{noMwst ? "" : " (brutto)"}</>}
                    {Math.max(0, hvSachkostenDelta) > 0 && <><br />+ Sachkosten: {fmt(Math.max(0, noMwst ? hvSachkostenDelta : Math.round(hvSachkostenDelta * 1.19 * 100) / 100)).replace(".", ",")} €{noMwst ? "" : " (brutto)"}</>}
                  </p>
                </div>
              )}
              {hvOnlyMode ? (
                wunschGesamt > 0 && (
                  effectiveMaxSteigerung > 3.5
                    ? <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                        Steigerungssatz über 3,5-fach — Honorarvereinbarung ist erforderlich.
                      </div>
                    : <div className="mt-2 px-3 py-2 bg-gray-50 border border-[#DFE3EB] rounded text-xs text-gray-500">
                        Steigerungssatz unter 3,5-fach — keine Honorarvereinbarung nötig.
                      </div>
                )
              ) : (
                <>
                  {effectiveMaxSteigerung > 3.5 && fromHvId ? (
                    <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                      Honorarvereinbarung ist verknüpft. Anforderungen gemäß §2 GOÄ sind erfüllt.
                    </div>
                  ) : effectiveMaxSteigerung > 3.5 ? (
                    <div className="mt-2 px-3 py-2 bg-gray-50 border border-[#DFE3EB] rounded text-xs text-gray-500">
                      Über 3,5-fach: Eine Honorarvereinbarung gemäß §2 GOÄ wird zusätzlich zur Rechnung erstellt und ein Verweis auf die Honorarvereinbarung wird auf der Rechnung vermerkt.
                    </div>
                  ) : null}
                  {needsBegruendung && (
                    <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      Über 2,3-fach: Eine Begründung für den erhöhten Steigerungssatz ist erforderlich.
                    </div>
                  )}
                  {needsBegruendung && (
                    <div className="mt-2">
                      <label className="text-xs text-gray-500 mb-1 block">Begründung gemäß §5 Abs. 2 GOÄ</label>
                      <textarea
                        className="w-full border border-[#DFE3EB] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        rows={2}
                        value={begruendung}
                        onChange={(e) => setBegruendung(e.target.value)}
                        placeholder="Überdurchschnittlicher Zeitaufwand und erhöhte Schwierigkeit aufgrund individueller anatomischer Gegebenheiten."
                      />
                    </div>
                  )}
                </>
              )}
              <button className="mt-2 text-xs text-blue-500 hover:text-blue-700 transition" onClick={() => setShowVerdienst(true)}>
                {hvOnlyMode ? "Mein geplanter Verdienst zeigen" : "Mein Verdienst zeigen"}
              </button>
            </div>

            {/* Actions */}
            <div className="mt-8">
              {!hvOnlyMode && (
              <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                <input type="checkbox" className="w-4 h-4 flex-shrink-0 rounded border-gray-300 text-green-500 focus:ring-green-400" checked={markAsPaid} onChange={(e) => setMarkAsPaid(e.target.checked)} />
                <span className="text-xs text-gray-500">Als bezahlt markieren <span className="text-gray-400">(Rechnung erscheint ohne Zahlungsaufforderung und Bankverbindung)</span></span>
              </label>
              )}
              {!hvOnlyMode && treatmentMarkers.length > 0 && (
                <label className="flex items-start gap-2 cursor-pointer select-none mb-4">
                  <input type="checkbox" className="w-4 h-4 mt-0.5 flex-shrink-0 rounded border-gray-300 text-blue-500 focus:ring-blue-400" checked={attachTreatmentPdf} onChange={(e) => setAttachTreatmentPdf(e.target.checked)} />
                  <span className="text-xs text-gray-500">Behandlungsdokumentation ohne Notizen an Rechnung anhängen</span>
                </label>
              )}
              <div className="flex items-center justify-between">
                <button className="px-4 py-2 text-sm rounded-lg border border-[#DFE3EB] text-gray-500 hover:bg-gray-50" onClick={() => { setAmendingId(null); setHvOnlyMode(false); navigate("/rechnungen"); }}>
                  Abbrechen
                </button>
                <button
                  className={`px-6 py-2.5 text-sm rounded-lg font-medium transition flex items-center gap-2 ${isSaving ? "bg-gray-500 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-700"} text-white`}
                  onClick={handleSubmit}
                  disabled={isSaving}
                >
                  {isSaving && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isSaving ? "Wird gespeichert…" : (hvOnlyMode ? (amendingId ? "Änderung speichern" : "Dokument erstellen") : (amendingId ? "Änderung speichern" : (effectiveMaxSteigerung > 3.5 && !fromHvId) ? "Dokumente erstellen" : "Rechnung erstellen"))}
                </button>
              </div>
            </div>
          </div>
          {/* Right side: Live Preview (hidden on mobile) */}
          <div className="flex-1 min-w-0 sticky top-4 self-start hidden lg:block">
            <div className="rounded-lg border border-[#DFE3EB] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{hvOnlyMode ? "Vorschau Honorarvereinbarung" : "Vorschau Rechnung"}</p>
              </div>
              <PreviewScaler>
                {hvOnlyMode ? (
                  <HonorarvereinbarungPreview
                    practice={practice}
                    patient={patient}
                    invoiceMeta={invoiceMeta}
                    lineItems={liveItems}
                    isStandalone
                  />
                ) : (
                  <InvoicePreview
                    practice={practice}
                    patient={patient}
                    invoiceMeta={{ ...invoiceMeta, diagnose: indicationType === "medical" ? diagnose : "" }}
                    lineItems={liveItems}
                    begruendung={needsBegruendung ? (begruendung || "Überdurchschnittlicher Zeitaufwand und erhöhte Schwierigkeit aufgrund individueller anatomischer Gegebenheiten.") : ""}
                    targetGesamt={wunschGesamt > 0 ? wunschGesamt : undefined}
                    voucherRedemption={liveVoucherRedemption}
                    paymentStatus={markAsPaid ? "bezahlt" : "ausstehend"}
                  />
                )}
              </PreviewScaler>
            </div>
          </div>
          </div>
          )}
          </div>
          </div>
          </>
        )}

        {/* ═══ MOBILE PREVIEW FAB (create page only) ═══ */}
        {(isCreatePage || patientCreateModal === "rechnung" || patientCreateModal === "hv") && (
          <button
            className="lg:hidden fixed bottom-6 right-5 z-40 bg-gray-800 text-white rounded-full shadow-lg flex items-center gap-1.5 pl-3 pr-3.5 py-2.5 text-xs font-medium hover:bg-gray-700 active:bg-gray-600 transition"
            onClick={() => setMobilePreviewOpen(true)}
            style={{ boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            {hvOnlyMode ? "HV-Vorschau" : "Rechnungsvorschau"}
          </button>
        )}

        {/* ═══ MOBILE PREVIEW MODAL ═══ */}
        {mobilePreviewOpen && (
          <div className="fixed inset-0 z-50 bg-white lg:hidden flex flex-col" style={{ overscrollBehavior: "contain" }}>
            {/* Sticky close button bar */}
            <div className="flex-shrink-0 flex justify-end px-3 py-2 bg-white border-b border-gray-100" style={{ zIndex: 60 }}>
              <button
                className="bg-gray-800 text-white rounded-full w-9 h-9 flex items-center justify-center shadow-lg active:bg-gray-600 transition"
                onClick={() => setMobilePreviewOpen(false)}
                style={{ boxShadow: "0 2px 10px rgba(0,0,0,.3)" }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Scrollable + zoomable preview area */}
            <div className="flex-1 overflow-auto pb-6 px-2" style={{ WebkitOverflowScrolling: "touch" }}>
              <MobileScaledPreview a4Width={794} className="w-full">
                {hvOnlyMode ? (
                  <HonorarvereinbarungPreview
                    practice={practice}
                    patient={patient}
                    invoiceMeta={invoiceMeta}
                    lineItems={liveItems}
                    isStandalone
                  />
                ) : (
                  <InvoicePreview
                    practice={practice}
                    patient={patient}
                    invoiceMeta={{ ...invoiceMeta, diagnose: indicationType === "medical" ? diagnose : "" }}
                    lineItems={liveItems}
                    begruendung={needsBegruendung ? (begruendung || "Überdurchschnittlicher Zeitaufwand und erhöhte Schwierigkeit aufgrund individueller anatomischer Gegebenheiten.") : ""}
                    targetGesamt={wunschGesamt > 0 ? wunschGesamt : undefined}
                    voucherRedemption={liveVoucherRedemption}
                    paymentStatus={markAsPaid ? "bezahlt" : "ausstehend"}
                  />
                )}
              </MobileScaledPreview>
            </div>
          </div>
        )}

        {/* ═══ LIST PAGE ═══ */}
        {isListPage && (() => {
          const listInitialTab = pathname === "/honorarvereinbarungen" ? "hv"
            : pathname === "/aufklaerung" ? "consent"
            : pathname === "/behandlungen" ? "td"
            : "rechnungen";
          return (
          <InvoiceListView
            invoices={invoices}
            kleinunternehmer={practice.kleinunternehmer}
            onView={handleView}
            onViewHV={handleViewHV}
            onViewTD={handleViewTD}
            onDelete={handleDelete}
            onPrint={handlePrintInvoice}
            onPrintHV={handlePrintHV}
            onPrintTD={handlePrintTD}
            onDownload={handleDownloadInvoice}
            onDownloadHV={handleDownloadHV}
            onDownloadTD={handleDownloadTD}
            onDownloadConsent={(inv) => {
              setViewingInvoice(inv);
              setPreviewTab("consent");
              navigate(`/aufklaerung/${inv._supabaseId || String(inv.id)}`);
              setTimeout(async () => {
                const tpl = CONSENT_TEMPLATES.find(t => t.id === inv.consentData?.templateId);
                const templateName = tpl ? tpl.title.replace("Aufklärungsbogen — ", "").replace(/\s+/g, "_") : "Aufklaerung";
                const patName = [inv.patient?.vorname, inv.patient?.nachname].filter(Boolean).join("_") || "Patient";
                const filename = `Aufklaerung_${templateName}_${patName}_${inv.invoiceMeta.datum}.pdf`;
                const result = await generateMultiPagePDF("consent-form-pdf-target");
                if (result) {
                  const blob = result.pdf.output("blob");
                  const file = new File([blob], filename, { type: "application/pdf" });
                  const isMobile = window.innerWidth < 640;
                  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: filename }); } catch (e) { if (e.name !== "AbortError") result.pdf.save(filename); }
                  } else { result.pdf.save(filename); }
                }
                navigate("/aufklaerung");
                setViewingInvoice(null);
              }, 500);
            }}
            onBack={() => navigate("/patients")}
            patients={patients}
            onNewForPatient={handleNewForPatient}
            onNewHVForPatient={handleNewHVForPatient}
            onNewConsentForPatient={(p) => {
              const patientData = p.data || p._raw?.data || p;
              const patientObj = { ...patientData, id: p.id, _raw: p._raw || p };
              setConsentWarningPatient(patientObj);
            }}
            onUpdateInvoice={async (updated) => {
              setInvoices(invoices.map(inv => inv.id === updated.id ? updated : inv));
              if (session && updated._supabaseId) {
                try {
                  await e2eeFetchModifySave(session.access_token, updated._supabaseId, { paymentStatus: updated.paymentStatus });
                  logActivity(updated._patientDbId, "rechnung", updated._supabaseId, "updated", `Zahlungsstatus: ${updated.paymentStatus === "bezahlt" ? "Bezahlt" : "Ausstehend"}`);
                } catch (e) { console.error("Failed to persist status:", e); }
              }
            }}
            initialTab={listInitialTab}
            onTabChange={(tab) => {
              const routes = { rechnungen: "/rechnungen", hv: "/honorarvereinbarungen", consent: "/aufklaerung", td: "/behandlungen" };
              navigate(routes[tab] || "/rechnungen");
            }}
          />
          );
        })()}

        {/* ═══ VOUCHER LIST ═══ */}
        {isVoucherListPage && (
          <VoucherListView
            vouchers={vouchers}
            onNew={handleNewVoucher}
            onView={handleViewVoucher}
            onDelete={handleDeleteVoucher}
            onBack={() => navigate("/patients")}
          />
        )}

        {/* ═══ VOUCHER CREATE ═══ */}
        {isVoucherCreatePage && (() => {
          const lastNum = vouchers.map((v) => v.receiptMeta?.nummer).filter(Boolean)[0];
          const suggested = lastNum ? (nextInvoiceNumber(lastNum) || "") : "";
          return (
            <VoucherCreateForm
              suggestedNummer={suggested}
              practiceOrt=""
              onCreate={handleCreateVoucher}
              onCancel={() => navigate("/gutscheine")}
              busy={voucherBusy}
            />
          );
        })()}

        {/* ═══ VOUCHER PREVIEW (Karte / Beleg) ═══ */}
        {isVoucherPreviewPage && (() => {
          const voucher = (viewingVoucher && viewingVoucher.id === activeVoucherId) ? viewingVoucher : vouchers.find((v) => v.id === activeVoucherId);
          if (!voucher) return <div className="max-w-xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">Gutschein nicht gefunden.</div>;
          const receiptMeta = voucher.receiptMeta || {};
          const isKarte = voucherPreviewTab === "karte";
          const elementId = isKarte ? "voucher-preview" : "voucher-receipt-preview";
          const filename = isKarte ? `Gutschein_${voucher.code}.pdf` : `Beleg_${voucher.code}.pdf`;
          return (
            <div>
              {/* Toolbar - aligned with the document preview UIs */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <button className="px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" onClick={() => navigate("/gutscheine")}>
                    ← Zurück
                  </button>
                  <div className="flex gap-1">
                    <button
                      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs rounded-lg border transition ${isKarte ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 border-[#DFE3EB] hover:bg-gray-50"}`}
                      onClick={() => setVoucherPreviewTab("karte")}
                    >
                      Gutschein
                    </button>
                    <button
                      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs rounded-lg border transition ${!isKarte ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 border-[#DFE3EB] hover:bg-gray-50"}`}
                      onClick={() => setVoucherPreviewTab("beleg")}
                    >
                      Beleg (Rechnung)
                    </button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button className="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition sm:hidden" onClick={() => shareOrDownloadPDF(elementId, filename)} title="Teilen">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  </button>
                  <button className="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition hidden sm:block" onClick={() => shareOrDownloadPDF(elementId, filename)} title="PDF herunterladen">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                  </button>
                  <button className="p-2 rounded-lg border border-[#DFE3EB] text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition" onClick={() => printElement(elementId, filename)} title="Drucken">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  </button>
                </div>
              </div>
              <div className="bg-gray-100 rounded-xl p-3 sm:p-6 overflow-auto">
                <PreviewScaler>
                  {isKarte
                    ? <VoucherPreview practice={practice} voucher={voucher} />
                    : <VoucherReceiptPreview practice={practice} purchaser={{ name: voucher.purchaserName }} voucher={voucher} receiptMeta={receiptMeta} />}
                </PreviewScaler>
              </div>
            </div>
          );
        })()}

        {/* ═══ ONBOARDING STEP 0: WELCOME ═══ */}
        {onboardingStep === "welcome" && (pathname === "/patients" || pathname === "/") && dataLoaded && !showSettings && (
          <div className="max-w-lg mx-auto mt-12 sm:mt-20 px-4">
            <div className="bg-white rounded-xl border border-[#DFE3EB] shadow-sm overflow-hidden">
              <div className="px-6 py-8">
                <div className="text-3xl mb-4 text-center">👋</div>
                <h1 className="text-xl font-semibold text-gray-800 mb-3 text-center">Willkommen bei EPHIA!</h1>
                <p className="text-sm text-gray-500 mb-6 text-center">Schön, dass Du dabei bist. In zwei kurzen Schritten bist Du startklar.</p>
                <div className="space-y-4 mb-7">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">Praxiseinstellungen ausfüllen</div>
                      <div className="text-xs text-gray-400 mt-0.5">Name, Adresse, Bankverbindung — alles, was auf Deinen Rechnungen erscheinen soll.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                    <div>
                      <div className="text-sm font-medium text-gray-400">Erste:r Patient:in anlegen</div>
                      <div className="text-xs text-gray-300 mt-0.5">Du kannst auch mit Testdaten starten und echte Patient:innen später hinzufügen.</div>
                    </div>
                  </div>
                </div>
                <button
                  className="w-full px-4 py-2.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition font-medium"
                  onClick={() => { setOnboardingStep(null); setShowSettings(true); }}
                >
                  Los geht's
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ONBOARDING STEP 2 + GENERAL EMPTY STATE ═══ */}
        {(pathname === "/patients" || pathname === "/") && patients.length === 0 && dataLoaded && !showSettings && onboardingStep !== "welcome" && (
          <div className="max-w-lg mx-auto mt-12 sm:mt-20 px-4">
            <div className="bg-white rounded-xl border border-[#DFE3EB] shadow-sm overflow-hidden">
              {onboardingStep === "patient" ? (
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-xs font-medium text-green-600">Schritt 1 erledigt</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">2</div>
                    <h2 className="text-base font-semibold text-gray-800">Erste:r Patient:in anlegen</h2>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 ml-7">Alles in EPHIA wird auf Patientenebene erstellt. Du kannst auch mit Testdaten starten und den Eintrag jederzeit wieder löschen.</p>
                </div>
              ) : (
                <div className="px-6 py-6 text-center border-b border-gray-100">
                  <div className="text-2xl mb-2">👤</div>
                  <p className="text-sm text-gray-500">Noch keine Patient:innen angelegt.</p>
                  <p className="text-xs text-gray-400 mt-1">Leg jetzt die erste:n an, um loszulegen.</p>
                </div>
              )}
              <div className="px-6 py-5">
                <div className="flex items-center gap-1.5 mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">Patient:in anlegen</h2>
                  <InfoTooltip wide>Alle Patient:innendaten werden Ende-zu-Ende-verschlüsselt (AES-256-GCM) die Verschlüsselung erfolgt direkt in Deinem Browser, bevor die Daten unseren Server erreichen. EPHIA hat zu keinem Zeitpunkt Zugriff auf die Klartextdaten. Damit erfüllen wir die Anforderungen der DSGVO an den Schutz personenbezogener Gesundheitsdaten (Art. 9, 32 DSGVO).</InfoTooltip>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Vorname *</label>
                    <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.vorname} placeholder="Maria" onChange={(e) => setNewPatientData({ ...newPatientData, vorname: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Nachname *</label>
                    <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.nachname} placeholder="Müller" onChange={(e) => setNewPatientData({ ...newPatientData, nachname: e.target.value })} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">E-Mail</label>
                  <input type="email" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.email} placeholder="maria.mueller@beispiel.de" onChange={(e) => setNewPatientData({ ...newPatientData, email: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Telefon</label>
                  <input type="tel" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.phone} placeholder="+49 123 456789" onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Straße & Hausnummer</label>
                  <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.address1} placeholder="Musterstraße 5" onChange={(e) => setNewPatientData({ ...newPatientData, address1: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">PLZ</label>
                    <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={parsePlzOrt(newPatientData.address2).plz} placeholder="10117" maxLength={5} inputMode="numeric" onChange={(e) => { const v = e.target.value; const { ort } = parsePlzOrt(newPatientData.address2); setNewPatientData({ ...newPatientData, address2: combinePlzOrt(v, ort) }); if (v.length === 5 && !ort && (!newPatientData.country || newPatientData.country === "Deutschland")) lookupPlz(v).then(city => { if (city) { setNewPatientData(d => ({ ...d, address2: combinePlzOrt(v, parsePlzOrt(d.address2).ort || city) })); const ortEl = e.target.closest(".grid")?.querySelector("[data-ort-field]"); flashOrtField(ortEl); } }); }} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Ort</label>
                    <input data-ort-field className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={parsePlzOrt(newPatientData.address2).ort} placeholder="Berlin" onChange={(e) => { const { plz } = parsePlzOrt(newPatientData.address2); setNewPatientData({ ...newPatientData, address2: combinePlzOrt(plz, e.target.value) }); }} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Land</label>
                  <select className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={newPatientData.country} onChange={(e) => setNewPatientData({ ...newPatientData, country: e.target.value })}>
                    {PRIORITY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option disabled>────────────</option>
                    {OTHER_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="border-t border-gray-100 pt-3 mb-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Medizinische Angaben (optional)</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Geburtsdatum</label>
                      <input type="date" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.geburtsdatum} onChange={(e) => setNewPatientData({ ...newPatientData, geburtsdatum: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Geschlecht</label>
                      <select className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={newPatientData.geschlecht} onChange={(e) => setNewPatientData({ ...newPatientData, geschlecht: e.target.value })}>
                        <option value="">Bitte wählen</option>
                        <option value="w">Weiblich</option>
                        <option value="m">Männlich</option>
                        <option value="d">Divers</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Größe (cm)</label>
                      <input type="number" min="0" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.groesse} placeholder="170" onChange={(e) => setNewPatientData({ ...newPatientData, groesse: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Gewicht (kg)</label>
                      <input type="number" min="0" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.gewicht} placeholder="70" onChange={(e) => setNewPatientData({ ...newPatientData, gewicht: e.target.value })} />
                    </div>
                  </div>
                </div>
                <button
                  className="w-full px-4 py-2.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  disabled={!newPatientData.vorname.trim() || !newPatientData.nachname.trim()}
                  onClick={async () => {
                    try {
                      if (session && currentMEK) {
                        const patientHash = await computePatientHash(getPatientIdentifier(newPatientData), currentMEK);
                        const { ciphertext: ptCipher, iv: ptIv } = await encryptData(newPatientData, currentMEK);
                        await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                          body: JSON.stringify({ user_id: user.id, email: patientHash, patient_hash: patientHash, data: ptCipher, iv: ptIv, encryption_version: 1 }),
                        });
                        trackEvent("patient_created", { source: "welcome" }, session.access_token);
                        const patientRecords = await supabaseFetchPatients(session.access_token, user.id);
                        const decryptedPatients = [];
                        for (const rec of patientRecords) {
                          let pd = rec.data;
                          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof pd === "string") {
                            try { pd = await decryptData(pd, rec.iv, currentMEK); } catch (e) { continue; }
                          }
                          decryptedPatients.push({ ...rec, data: pd });
                        }
                        setPatients(decryptedPatients);
                      } else if (session) {
                        // Fail closed: refuse to create an unencrypted patient (plaintext PII).
                        // A logged-in user always has currentMEK; if not, re-login is required.
                        showErrorToast("Verschlüsselung nicht bereit. Bitte melde Dich neu an, bevor Du Patient:innen anlegst.");
                        return;
                      }
                    } catch (e) { console.error("Error creating patient:", e); }
                    setNewPatientData(EMPTY_PATIENT);
                    setOnboardingStep(null);
                    window.scrollTo(0, 0);
                  }}
                >
                  Patient:in anlegen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PATIENTS PAGE ═══ */}
        {(pathname === "/patients" || pathname === "/") && patients.length > 0 && !showAddPatient && (
          <PatientListView
            patients={patients}
            invoices={invoices}
            kleinunternehmer={practice.kleinunternehmer}
            onSelectPatient={(p) => { setSelectedPatient(p); navigate(`/patients/${p.id || p._raw?.id || p.data?.id}`); }}
            onDeletePatient={(p) => setConfirmDeletePatient(p)}
            onAddPatient={() => setShowAddPatient(true)}
            onBack={() => navigate("/patients")}
          />
        )}

        {(pathname === "/patients" || pathname === "/") && patients.length > 0 && showAddPatient && (
          <div className="bg-white rounded-lg border border-[#DFE3EB] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <button className="text-xs text-gray-400 hover:text-gray-600 mb-2" onClick={() => { setShowAddPatient(false); setNewPatientData(EMPTY_PATIENT); }}>← Zurück zur Patient:innenliste</button>
              <h2 className="text-base font-semibold text-gray-800">Neue:n Patient:in anlegen</h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Vorname *</label>
                  <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.vorname} placeholder="Maria" onChange={(e) => setNewPatientData({ ...newPatientData, vorname: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Nachname *</label>
                  <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.nachname} placeholder="Müller" onChange={(e) => setNewPatientData({ ...newPatientData, nachname: e.target.value })} />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">E-Mail</label>
                <input type="email" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.email} placeholder="maria.mueller@beispiel.de" onChange={(e) => setNewPatientData({ ...newPatientData, email: e.target.value })} />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Telefon</label>
                <input type="tel" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.phone} placeholder="+49 123 456789" onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })} />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Straße & Hausnummer</label>
                <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.address1} placeholder="Musterstraße 5" onChange={(e) => setNewPatientData({ ...newPatientData, address1: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">PLZ</label>
                  <input className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={parsePlzOrt(newPatientData.address2).plz} placeholder="10117" maxLength={5} inputMode="numeric" onChange={(e) => { const v = e.target.value; const { ort } = parsePlzOrt(newPatientData.address2); setNewPatientData({ ...newPatientData, address2: combinePlzOrt(v, ort) }); if (v.length === 5 && !ort && (!newPatientData.country || newPatientData.country === "Deutschland")) lookupPlz(v).then(city => { if (city) { setNewPatientData(d => ({ ...d, address2: combinePlzOrt(v, parsePlzOrt(d.address2).ort || city) })); const ortEl = e.target.closest(".grid")?.querySelector("[data-ort-field]"); flashOrtField(ortEl); } }); }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Ort</label>
                  <input data-ort-field className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={parsePlzOrt(newPatientData.address2).ort} placeholder="Berlin" onChange={(e) => { const { plz } = parsePlzOrt(newPatientData.address2); setNewPatientData({ ...newPatientData, address2: combinePlzOrt(plz, e.target.value) }); }} />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Land</label>
                <select className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={newPatientData.country} onChange={(e) => setNewPatientData({ ...newPatientData, country: e.target.value })}>
                  {PRIORITY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option disabled>────────────</option>
                  {OTHER_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-100 pt-3 mb-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Medizinische Angaben (optional)</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Geburtsdatum</label>
                    <input type="date" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.geburtsdatum} onChange={(e) => setNewPatientData({ ...newPatientData, geburtsdatum: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Geschlecht</label>
                    <select className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={newPatientData.geschlecht} onChange={(e) => setNewPatientData({ ...newPatientData, geschlecht: e.target.value })}>
                      <option value="">Bitte wählen</option>
                      <option value="w">Weiblich</option>
                      <option value="m">Männlich</option>
                      <option value="d">Divers</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Größe (cm)</label>
                    <input type="number" min="0" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.groesse} placeholder="170" onChange={(e) => setNewPatientData({ ...newPatientData, groesse: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Gewicht (kg)</label>
                    <input type="number" min="0" className="w-full border border-[#DFE3EB] rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" value={newPatientData.gewicht} placeholder="70" onChange={(e) => setNewPatientData({ ...newPatientData, gewicht: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!newPatientData.vorname.trim() || !newPatientData.nachname.trim()}
                  onClick={async () => {
                    try {
                      if (session && currentMEK) {
                        const patientHash = await computePatientHash(getPatientIdentifier(newPatientData), currentMEK);
                        const { ciphertext: ptCipher, iv: ptIv } = await encryptData(newPatientData, currentMEK);
                        await fetch(`${SUPABASE_URL}/rest/v1/patients`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                          body: JSON.stringify({ user_id: user.id, email: patientHash, patient_hash: patientHash, data: ptCipher, iv: ptIv, encryption_version: 1 }),
                        });
                        trackEvent("patient_created", { source: "patient_list" }, session.access_token);
                        const patientRecords = await supabaseFetchPatients(session.access_token, user.id);
                        const decryptedPatients = [];
                        for (const rec of patientRecords) {
                          let pd = rec.data;
                          if (currentMEK && rec.encryption_version >= 1 && rec.iv && typeof pd === "string") {
                            try { pd = await decryptData(pd, rec.iv, currentMEK); } catch (e) { continue; }
                          }
                          decryptedPatients.push({ ...rec, data: pd });
                        }
                        setPatients(decryptedPatients);
                      } else if (session) {
                        // Fail closed: refuse to create an unencrypted patient (plaintext PII).
                        // A logged-in user always has currentMEK; if not, re-login is required.
                        showErrorToast("Verschlüsselung nicht bereit. Bitte melde Dich neu an, bevor Du Patient:innen anlegst.");
                        return;
                      }
                    } catch (e) { console.error("Error creating patient:", e); }
                    setShowAddPatient(false);
                    setNewPatientData(EMPTY_PATIENT);
                  }}
                >
                  Patient:in anlegen
                </button>
                <InfoTooltip wide>Alle Patient:innendaten werden Ende-zu-Ende-verschlüsselt (AES-256-GCM) die Verschlüsselung erfolgt direkt in Deinem Browser, bevor die Daten unseren Server erreichen. EPHIA hat zu keinem Zeitpunkt Zugriff auf die Klartextdaten. Damit erfüllen wir die Anforderungen der DSGVO an den Schutz personenbezogener Gesundheitsdaten (Art. 9, 32 DSGVO).</InfoTooltip>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PATIENT DETAIL PAGE ═══ */}
        {isPatientDetail && selectedPatient && (
          <PatientDetailView
            patient={selectedPatient}
            invoices={invoices}
            behandlungen={behandlungen}
            docsMigrated={docsMigrated.current}
            kleinunternehmer={practice.kleinunternehmer}
            practice={practice}
            activityLog={activityLog}
            onLogActivity={logActivity}
            onCreateBehandlung={handleCreateBehandlung}
            onUpdateBehandlung={handleUpdateBehandlung}
            onDeleteBehandlung={handleDeleteBehandlung}
            onLinkDocToBehandlung={handleLinkDocToBehandlung}
            onBack={() => navigate("/patients")}
            onView={(inv) => { setPreviewTab("rechnung"); navigateToPreview(inv); }}
            onViewHV={(inv) => { setPreviewTab("honorar"); navigateToPreview(inv); }}
            onDownload={handleDownloadInvoice}
            onDownloadHV={handleDownloadHV}
            onCreateInvoice={(p, behId) => { pendingDocBehIdRef.current = behId || null; handleNewForPatient(p); }}
            onNewHV={(behId) => { pendingDocBehIdRef.current = behId || null; handleNewHVForPatient(selectedPatient); }}
            onStartConsent={(p, behId) => {
              pendingDocBehIdRef.current = behId || null;
              setConsentWarningPatient(p);
            }}
            onViewConsent={(inv) => { setPreviewTab("consent"); navigateToPreview(inv); }}
            onDownloadConsent={(inv) => {
              const prevPatientId = activePatientId;
              setViewingInvoice(inv);
              setPreviewTab("consent");
              navigate(`/aufklaerung/${inv._supabaseId || String(inv.id)}`);
              setTimeout(async () => {
                const tpl = CONSENT_TEMPLATES.find(t => t.id === inv.consentData?.templateId);
                const templateName = tpl ? tpl.title.replace("Aufklärungsbogen — ", "").replace(/\s+/g, "_") : "Aufklaerung";
                const patName = [inv.patient?.vorname, inv.patient?.nachname].filter(Boolean).join("_") || "Patient";
                const filename = `Aufklaerung_${templateName}_${patName}_${inv.invoiceMeta.datum}.pdf`;
                const result = await generateMultiPagePDF("consent-form-pdf-target");
                if (result) {
                  const blob = result.pdf.output("blob");
                  const file = new File([blob], filename, { type: "application/pdf" });
                  const isMobile = window.innerWidth < 640;
                  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: filename }); } catch (e) { if (e.name !== "AbortError") result.pdf.save(filename); }
                  } else { result.pdf.save(filename); }
                }
                navigate(`/patients/${prevPatientId}`);
              }, 500);
            }}
            onPrint={(inv) => { setPreviewTab("rechnung"); navigateToPreview(inv); setTimeout(() => printElement("invoice-preview", `Rechnung ${inv.invoiceMeta.nummer}`), 100); }}
            onPrintHV={handlePrintHV}
            onDelete={(id) => setConfirmDeleteId(id)}
            onUpdateInvoice={async (updated, isNew) => {
              if (updated._deleted) {
                if (session && updated._supabaseId) {
                  try { await deleteDocAdapter(updated._supabaseId); }
                  catch (e) { console.error("Failed to delete treatment:", e); }
                }
                logActivity(updated._patientDbId, "behandlungsdoku", updated._supabaseId, "deleted", "Behandlungsdoku gelöscht");
                setInvoices(invoices.filter(inv => inv.id !== updated.id));
              }
              else if (isNew) {
                if (session) {
                  try {
                    const tdPatientId = updated._patientDbId || null;
                    const tdBehandlungId = updated._behandlungId || null;
                    const created = await saveDocAdapter(updated, "behandlungsdoku", tdPatientId, tdBehandlungId);
                    updated._supabaseId = created.id;
                    updated._docType = "behandlungsdoku";
                    updated._createdAt = created.created_at || new Date().toISOString();
                    logActivity(tdPatientId, "behandlungsdoku", created.id, "created", "Behandlungsdoku erstellt");
                  } catch (e) { console.error("Failed to persist standalone treatment:", e); }
                }
                setInvoices([updated, ...invoices]);
              }
              else {
                setInvoices(invoices.map(inv => inv.id === updated.id ? updated : inv));
                if (session && updated._supabaseId) {
                  try {
                    await updateDocAdapter(updated._supabaseId, updated);
                    logActivity(updated._patientDbId, updated._docType || "behandlungsdoku", updated._supabaseId, "updated", "Dokument aktualisiert");
                  } catch (e) { console.error("Failed to persist treatment update:", e); }
                }
              }
            }}
            onQuickInvoice={async ({ treatment, nummer, wunschGesamt, customS, lineItems, gesamt, hasHV, praeparat: qPraep, einheit: qEinh, ml: qMl, preisProMl: qPpm, attachTreatmentPdf: qAttachTreatment }) => {
              try {
                // Resolve decrypted patient data: _raw.data (from edit flows) > .data (from list) > top-level fields
                const rawData = selectedPatient._raw?.data;
                const pd = (typeof rawData === "object" && rawData) || (typeof selectedPatient.data === "object" && selectedPatient.data) || { vorname: selectedPatient.vorname || "", nachname: selectedPatient.nachname || "", email: selectedPatient.email || "" };
                const patientDbId = selectedPatient._raw?.id || selectedPatient?.id || null;
                const isAusland = (pd.country || "Deutschland") !== "Deutschland";

                const entry = {
                  id: Date.now(),
                  patient: { vorname: pd.vorname || "", nachname: pd.nachname || "", email: pd.email || "", phone: pd.phone || "", address1: pd.address1 || "", address2: pd.address2 || "", country: pd.country || "Deutschland" },
                  _patientDbId: patientDbId,
                  invoiceMeta: { nummer, ort: practice.city || "", datum: treatment.treatmentDoc?.behandlungsDatum || new Date().toISOString().slice(0, 10) },
                  lineItems,
                  hasHV,
                  praeparat: qPraep,
                  einheit: qEinh,
                  ml: qMl,
                  mlStr: String(qMl).replace(".", ","),
                  preisProMl: qPpm,
                  preisProMlStr: String(qPpm).replace(".", ","),
                  wunschGesamtStr: String(wunschGesamt).replace(".", ","),
                  selectedZuschlaege: [],
                  sachkosten: [],
                  treatmentDoc: treatment.treatmentDoc || null,
                  attachTreatmentPdf: !!qAttachTreatment,
                  begruendung: (customS && (customS.s1 > 2.3 || customS.s5 > 2.3 || customS.s267 > 2.3) && Math.max(customS.s1, customS.s5, customS.s267) <= 3.5) ? "Überdurchschnittlicher Zeitaufwand und erhöhte Schwierigkeit aufgrund individueller anatomischer Gegebenheiten." : "",
                  paymentStatus: "ausstehend",
                  _kleinunternehmer: !!practice.kleinunternehmer,
                  _practice: { ...practice, logo: practice.logo || "" },
                  savedAt: new Date().toISOString(),
                };

                // Persist to Supabase (E2EE)
                if (session) {
                  const qiPatientId = patientDbId;
                  const qiBehandlungId = treatment._behandlungId || null;
                  const created = await saveDocAdapter(entry, hasHV ? "rechnung" : "rechnung", qiPatientId, qiBehandlungId);
                  entry._supabaseId = created.id;
                  entry._docType = "rechnung";
                  entry._behandlungId = qiBehandlungId;
                  entry._createdAt = created.created_at || new Date().toISOString();
                  logActivity(qiPatientId, "rechnung", created.id, "created", `Schnellrechnung ${nummer} erstellt`);
                }

                setInvoices([entry, ...invoices]);

                // Link the treatment to the new invoice by updating it
                const updatedTreatment = { ...treatment, invoiceMeta: { ...treatment.invoiceMeta, nummer } };
                if (treatment._supabaseId && session) {
                  try {
                    await e2eeFetchModifySave(session.access_token, treatment._supabaseId, (stored) => ({ ...stored, invoiceMeta: { ...stored.invoiceMeta, nummer } }));
                  } catch (e) { console.error("Failed to link treatment:", e); }
                }
                setInvoices(prev => prev.map(inv => inv.id === treatment.id ? updatedTreatment : inv));

                // Show the new invoice
                setPreviewTab("rechnung");
                navigateToPreview(entry);
              } catch (err) {
                console.error("Quick invoice error:", err);
                showErrorToast("Fehler beim Erstellen der Rechnung: " + err.message);
              }
            }}
            onUpdatePatient={async (updatedData) => {
              try {
                const raw = selectedPatient._raw;
                if (session && currentMEK && raw) {
                  const newPatientHash = await computePatientHash(getPatientIdentifier(updatedData), currentMEK);
                  const { ciphertext, iv } = await encryptData(updatedData, currentMEK);
                  await fetch(`${SUPABASE_URL}/rest/v1/patients?id=eq.${pgv(raw.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Prefer": "return=representation" },
                    body: JSON.stringify({ data: ciphertext, iv, patient_hash: newPatientHash, encryption_version: 1 }),
                  });
                  // Reload patients
                  const patientRecords = await supabaseFetchPatients(session.access_token, user.id);
                  const decryptedPatients = [];
                  for (const rec of patientRecords) {
                    let pd = rec.data;
                    if (rec.encryption_version === 1 && rec.iv && currentMEK) {
                      try { pd = await decryptData(rec.data, rec.iv, currentMEK); } catch (e) { continue; }
                    }
                    decryptedPatients.push({ ...rec, data: pd });
                  }
                  setPatients(decryptedPatients);
                  // Update selectedPatient to reflect changes
                  const updated = decryptedPatients.find(p => p.id === raw.id);
                  const ud = (typeof updated?.data === "object" && updated?.data) || {};
                  if (updated) setSelectedPatient({ vorname: ud.vorname || "", nachname: ud.nachname || "", email: ud.email || "", _raw: updated });
                  logActivity(raw.id, "patient", raw.id, "updated", "Patient:innendaten aktualisiert");
                }
              } catch (e) { console.error("Error updating patient:", e); }
            }}
          />
        )}

        {/* ═══ CONSENT FORM PREVIEW ═══ */}
        {isPreviewPage && viewingInvoice && viewingInvoice._consentForm && (() => {
          const cd = viewingInvoice.consentData || {};
          const tpl = CONSENT_TEMPLATES.find(t => t.id === cd.templateId) || CONSENT_TEMPLATES[0];
          const viewPractice = viewingInvoice._practice || practice;
          const needsDoctorSig = !cd.refused && cd._signatures?.patient && !cd._signatures?.doctor;
          const isComplete = cd._signatures?.patient && cd._signatures?.doctor;
          const handleConsentDoctorSign = () => {
            setShowConsentDoctorSign(true);
          };
          const handleConsentDoctorSignComplete = async (doctorSigDataUrl) => {
            setShowConsentDoctorSign(false);
            if (!doctorSigDataUrl) return;
            const merged = { ...(cd._signatures || {}), doctor: doctorSigDataUrl };
            const updatedCd = { ...cd, _signatures: merged };
            // Generate PDF hash now that both signatures are present
            try {
              const tempInv = { ...viewingInvoice, consentData: updatedCd };
              setViewingInvoice(tempInv);
              setInvoices(prev => prev.map(inv => inv.id === tempInv.id ? tempInv : inv));
              await new Promise(r => setTimeout(r, 400));
              const result = await generateMultiPagePDF("consent-form-pdf-target");
              if (result) {
                const pdfArrayBuffer = result.pdf.output("arraybuffer");
                const hashBuffer = await crypto.subtle.digest("SHA-256", pdfArrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                updatedCd.pdfHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
              }
            } catch (e) { console.error("PDF hash error:", e); }
            await updateViewingInvoiceData({ consentData: updatedCd });
            setSaveToast("Arzt Unterschrift gespeichert");
            setTimeout(() => setSaveToast(""), 2500);
          };
          return (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 mx-auto" style={{ maxWidth: "210mm" }}>
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium text-gray-700">Aufklärungsbogen</h2>
                {cd.refused
                  ? <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">Abgelehnt</span>
                  : isComplete
                  ? <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">Vollständig</span>
                  : needsDoctorSig
                  ? <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">Ärzt:in fehlt</span>
                  : <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">Entwurf</span>
                }
              </div>
              <div className="flex gap-1.5 ml-auto">
                <button className="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition sm:hidden" title="Teilen" onClick={async () => {
                  const patName = [viewingInvoice.patient?.vorname, viewingInvoice.patient?.nachname].filter(Boolean).join("_") || "Patient";
                  const templateName = tpl.title.replace("Aufklärungsbogen — ", "").replace(/\s+/g, "_");
                  const filename = `Aufklaerung_${templateName}_${patName}_${viewingInvoice.invoiceMeta.datum}.pdf`;
                  try {
                    const result = await generateMultiPagePDF("consent-form-pdf-target");
                    if (result) {
                      const blob = result.pdf.output("blob");
                      const file = new File([blob], filename, { type: "application/pdf" });
                      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: filename });
                      } else { result.pdf.save(filename); }
                    }
                  } catch (e) { if (e.name !== "AbortError") console.error("Share failed:", e); }
                }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                </button>
                <button className="p-2 rounded-lg border border-[#DFE3EB] text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition" title="PDF herunterladen" onClick={async () => {
                  const patName = [viewingInvoice.patient?.vorname, viewingInvoice.patient?.nachname].filter(Boolean).join("_") || "Patient";
                  const templateName = tpl.title.replace("Aufklärungsbogen — ", "").replace(/\s+/g, "_");
                  const filename = `Aufklaerung_${templateName}_${patName}_${viewingInvoice.invoiceMeta.datum}.pdf`;
                  try {
                    const result = await generateMultiPagePDF("consent-form-pdf-target");
                    if (result) { result.pdf.save(filename); }
                    else showErrorToast("PDF konnte nicht erstellt werden: Dokument nicht gefunden.");
                  } catch (e) {
                    console.error("PDF download failed:", e);
                    showErrorToast("PDF konnte nicht erstellt werden: " + (e?.message || e));
                  }
                }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                </button>
                <button className="p-2 rounded-lg border border-[#DFE3EB] text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition" title="Drucken" onClick={() => {
                  const patName = [viewingInvoice.patient?.vorname, viewingInvoice.patient?.nachname].filter(Boolean).join("_") || "Patient";
                  printElement("consent-form-pdf-target", `Aufklaerung_${patName}`);
                }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button className="px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition flex items-center gap-1.5" onClick={() => {
                  setViewingInvoice(null);
                  const patId = viewingInvoice?._patientDbId || selectedPatient?.id || selectedPatient?._raw?.id;
                  navigate(patId ? `/patients/${patId}` : "/patients");
                }}>
                  Speichern & schließen
                </button>
              </div>
            </div>
            {/* A4 Preview: desktop shows full size, mobile uses scaled preview */}
            <div className="hidden lg:block mx-auto space-y-4" style={{ maxWidth: "210mm" }}>
              <ConsentFormPreview template={tpl} consentData={cd} patient={viewingInvoice.patient} practice={viewPractice} onDoctorSign={needsDoctorSig ? handleConsentDoctorSign : undefined} />
            </div>
            <MobileScaledPreview className="lg:hidden" a4Width={794}>
              <ConsentFormPreview template={tpl} consentData={cd} patient={viewingInvoice.patient} practice={viewPractice} onDoctorSign={needsDoctorSig ? handleConsentDoctorSign : undefined} />
            </MobileScaledPreview>
            {/* Hidden render target for PDF */}
            <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
              <ConsentFormPreview template={tpl} consentData={cd} patient={viewingInvoice.patient} practice={viewPractice} />
            </div>
            {/* Doctor signature modal for consent */}
            {showConsentDoctorSign && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowConsentDoctorSign(false)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-800">Unterschrift Ärzt:in</h3>
                    <button className="p-1 text-gray-400 hover:text-gray-600" onClick={() => setShowConsentDoctorSign(false)}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <SignaturePad key="consent-doctor-sig" label="Unterschrift Ärzt:in" onSave={handleConsentDoctorSignComplete} />
                  <button className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition py-1" onClick={() => setShowConsentDoctorSign(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ═══ PREVIEW PAGE ═══ */}
        {isPreviewPage && viewingInvoice && !viewingInvoice._consentForm && (() => {
          const isHvOnly = !!viewingInvoice._hvOnly;
          const isStandaloneTD = !!viewingInvoice._standalone;
          const linkedHV = viewingInvoice._fromHvId ? invoices.find((inv) => inv.id === viewingInvoice._fromHvId) : null;
          const viewHasHV = isHvOnly || (!isStandaloneTD && (linkedHV || (viewingInvoice.hasHV != null ? viewingInvoice.hasHV : (viewingInvoice.lineItems || []).some((it) => it.steigerung != null && it.steigerung > 3.5))));
          const viewHasTD = !isHvOnly && !!(viewingInvoice.treatmentDoc && (viewingInvoice.treatmentDoc.markers?.length > 0 || viewingInvoice.treatmentDoc.amount));
          const hasTabs = !isHvOnly && !isStandaloneTD && (viewHasHV || viewHasTD);
          const previewFacePhoto = viewingInvoice.treatmentDoc?.facePhoto || "";
          const a4Px = 793; // 210mm in px
          // Use practice settings from when document was created (fall back to current for older docs)
          const viewPractice = viewingInvoice._practice || practice;
          // Check for signed HV upload (on the HV itself, or on the linked HV)
          const hvSource = linkedHV || viewingInvoice;
          const signedHvUpload = hvSource._signedHvUpload || null;
          const hvSigsOuter = hvSource?._signatures;
          const hvIsFullySigned = !!(signedHvUpload || (hvSigsOuter?.patient && hvSigsOuter?.doctor));
          return (
          <div>
            {/* Toolbar - aligned with document */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 mx-auto" style={{ maxWidth: "210mm" }}>
              {/* Left: Bearbeiten + tabs */}
              <div className="flex items-center gap-2">
                {!((previewTab === "honorar" || isHvOnly) && hvIsFullySigned) && (
                  <button className="px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" onClick={() => handleAmend(viewingInvoice, previewTab)}>
                    Bearbeiten
                  </button>
                )}
                {hasTabs && (
                  <div className="flex gap-1">
                    <button
                      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs rounded-lg border transition ${previewTab === "rechnung" ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 border-[#DFE3EB] hover:bg-gray-50"}`}
                      onClick={() => setPreviewTab("rechnung")}
                    >
                      <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="hidden sm:inline">Rechnung</span>
                    </button>
                    {viewHasHV && (
                      <button
                        className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs rounded-lg border transition ${previewTab === "honorar" ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 border-[#DFE3EB] hover:bg-gray-50"}`}
                        onClick={() => setPreviewTab("honorar")}
                      >
                        <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                        <span className="hidden sm:inline">Honorarvereinbarung</span>
                      </button>
                    )}
                    {viewHasTD && (
                      <button
                        className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs rounded-lg border transition ${previewTab === "behandlung" ? "bg-gray-800 text-white border-gray-800" : "text-gray-500 border-[#DFE3EB] hover:bg-gray-50"}`}
                        onClick={() => setPreviewTab("behandlung")}
                      >
                        <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="hidden sm:inline">Behandlungsdokumentation</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* HV status badge */}
              {(previewTab === "honorar" || isHvOnly) && (() => {
                const hvSigs = (linkedHV || viewingInvoice)?._signatures;
                const hvSignedUpload = (linkedHV || viewingInvoice)?._signedHvUpload;
                if (hvSignedUpload) return <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">Unterschrieben</span>;
                if (hvSigs?.patient && hvSigs?.doctor) return <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">Vollständig</span>;
                if (hvSigs?.patient && !hvSigs?.doctor) return <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">Ärzt:in fehlt</span>;
                return null;
              })()}
              {/* Action buttons */}
              <div className="flex gap-1.5">
                {/* Share on mobile, Download on desktop */}
                <button className="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition sm:hidden" onClick={handleShareCurrent} title="Teilen">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                </button>
                <button className="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition hidden sm:block" onClick={handleDownloadCurrent} title="PDF herunterladen">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                </button>
                <button className="p-2 rounded-lg border border-[#DFE3EB] text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition" onClick={handlePrintCurrentDoc} title="Drucken">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button className="px-3 py-2 rounded-lg border border-[#DFE3EB] text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition" onClick={() => {
                  setViewingInvoice(null);
                  const patId = viewingInvoice?._patientDbId || selectedPatient?.id || selectedPatient?._raw?.id;
                  navigate(patId ? `/patients/${patId}` : "/patients");
                }}>
                  Speichern & schließen
                </button>
              </div>
            </div>
            {previewTab === "honorar" && viewHasHV && !isHvOnly && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 sm:px-4 py-2.5 text-xs text-amber-800 mb-3 mx-auto" style={{ maxWidth: "210mm" }}>
                {linkedHV
                  ? <><strong>Verknüpfte Honorarvereinbarung:</strong> Diese HV wurde vor der Rechnung erstellt und ist mit dieser Rechnung verknüpft.</>
                  : <><strong>Hinweis:</strong> Die Honorarvereinbarung enthält ausschließlich die ärztlichen Leistungen (GOÄ-Ziffern). Sachkosten und Präparatskosten werden in der Rechnung gesondert ausgewiesen.</>
                }
              </div>
            )}
            {/* Single document render — desktop shows full size, mobile scales it down */}
            <div className="hidden lg:flex flex-col items-center gap-6">
              <div className="shadow-lg border border-[#DFE3EB]" style={{ width: "210mm" }}>
                {(previewTab === "behandlung" || isStandaloneTD) ? (
                  <TreatmentDocPreview
                    practice={viewPractice}
                    patient={viewingInvoice.patient}
                    treatmentDoc={viewingInvoice.treatmentDoc}
                    einheit={viewingInvoice.einheit || viewingInvoice.treatmentDoc?.einheit || "SE"}
                    facePhoto={previewFacePhoto}
                  />
                ) : previewTab === "honorar" && viewHasHV ? (
                  signedHvUpload ? (
                    signedHvUpload.type === "image" ? (
                      <div style={{ width: "210mm", minHeight: "297mm", background: "white", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px" }}>
                        <img src={signedHvUpload.data} alt="Unterschriebene HV" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                      </div>
                    ) : (
                      <div style={{ width: "210mm", minHeight: "200px", background: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "16px" }}>
                        <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="text-sm font-medium text-gray-700">{signedHvUpload.filename || "Unterschriebene HV"}</p>
                        <p className="text-xs text-green-600 font-medium">PDF hochgeladen</p>
                        <a href={signedHvUpload.data} download={signedHvUpload.filename || "Honorarvereinbarung_signed.pdf"} className="px-4 py-2 text-xs rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition">
                          PDF herunterladen
                        </a>
                      </div>
                    )
                  ) : (
                    <HonorarvereinbarungPreview practice={viewPractice} patient={(linkedHV || viewingInvoice).patient} invoiceMeta={(linkedHV || viewingInvoice).invoiceMeta} lineItems={(linkedHV || viewingInvoice).lineItems} isStandalone={!!(linkedHV ? linkedHV._hvOnly : viewingInvoice._hvOnly)} signatures={(linkedHV || viewingInvoice)._signatures} onSignatureClick={() => setShowSignatureModal(true)} onDoctorSign={(linkedHV || viewingInvoice)._signatures?.patient && !(linkedHV || viewingInvoice)._signatures?.doctor ? () => setShowHvDoctorSign(true) : undefined} />
                  )
                ) : (
                  <InvoicePreview practice={viewPractice} patient={viewingInvoice.patient} invoiceMeta={viewingInvoice.invoiceMeta} lineItems={viewingInvoice.lineItems} begruendung={viewingInvoice.begruendung} targetGesamt={viewingInvoice.targetGesamt} voucherRedemption={viewingInvoice.voucherRedemption} paymentStatus={viewingInvoice.paymentStatus} />
                )}
              </div>
              {previewTab === "rechnung" && !isStandaloneTD && viewingInvoice.attachTreatmentPdf && viewingInvoice.treatmentDoc && (
                <div>
                  <p className="text-xs text-gray-400 text-center mb-2">Seite 2 — Behandlungsdokumentation</p>
                  <div className="shadow-lg border border-[#DFE3EB]" style={{ width: "210mm" }}>
                    <TreatmentDocPreview
                      practice={viewPractice}
                      patient={viewingInvoice.patient}
                      treatmentDoc={viewingInvoice.treatmentDoc}
                      einheit={viewingInvoice.einheit || viewingInvoice.treatmentDoc?.einheit || "SE"}
                      facePhoto={previewFacePhoto}
                    />
                  </div>
                </div>
              )}
            </div>
            <MobileScaledPreview className="lg:hidden" a4Width={a4Px}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div className="shadow-lg border border-[#DFE3EB]" style={{ width: a4Px }}>
                  {(previewTab === "behandlung" || isStandaloneTD) ? (
                    <TreatmentDocPreview
                      practice={viewPractice}
                      patient={viewingInvoice.patient}
                      treatmentDoc={viewingInvoice.treatmentDoc}
                      einheit={viewingInvoice.einheit || viewingInvoice.treatmentDoc?.einheit || "SE"}
                      facePhoto={previewFacePhoto}
                    />
                  ) : previewTab === "honorar" && viewHasHV ? (
                    signedHvUpload ? (
                      signedHvUpload.type === "image" ? (
                        <div style={{ width: a4Px, minHeight: 200, background: "white", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px" }}>
                          <img src={signedHvUpload.data} alt="Unterschriebene HV" style={{ maxWidth: "100%" }} />
                        </div>
                      ) : (
                        <div style={{ width: a4Px, minHeight: 200, background: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", gap: "12px" }}>
                          <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          <p className="text-xs font-medium text-gray-700">{signedHvUpload.filename || "Unterschriebene HV"}</p>
                          <p className="text-xs text-green-600 font-medium">PDF hochgeladen</p>
                          <a href={signedHvUpload.data} download={signedHvUpload.filename || "Honorarvereinbarung_signed.pdf"} className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition">
                            PDF herunterladen
                          </a>
                        </div>
                      )
                    ) : (
                      <HonorarvereinbarungPreview practice={viewPractice} patient={viewingInvoice.patient} invoiceMeta={viewingInvoice.invoiceMeta} lineItems={viewingInvoice.lineItems} isStandalone={!!viewingInvoice._hvOnly} signatures={viewingInvoice._signatures} onSignatureClick={() => setShowSignatureModal(true)} onDoctorSign={viewingInvoice._signatures?.patient && !viewingInvoice._signatures?.doctor ? () => setShowHvDoctorSign(true) : undefined} />
                    )
                  ) : (
                    <InvoicePreview practice={viewPractice} patient={viewingInvoice.patient} invoiceMeta={viewingInvoice.invoiceMeta} lineItems={viewingInvoice.lineItems} begruendung={viewingInvoice.begruendung} targetGesamt={viewingInvoice.targetGesamt} voucherRedemption={viewingInvoice.voucherRedemption} paymentStatus={viewingInvoice.paymentStatus} />
                  )}
                </div>
                {previewTab === "rechnung" && !isStandaloneTD && viewingInvoice.attachTreatmentPdf && viewingInvoice.treatmentDoc && (
                  <div>
                    <p style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", marginBottom: 8 }}>Seite 2 — Behandlungsdokumentation</p>
                    <div className="shadow-lg border border-[#DFE3EB]" style={{ width: a4Px }}>
                      <TreatmentDocPreview
                        practice={viewPractice}
                        patient={viewingInvoice.patient}
                        treatmentDoc={viewingInvoice.treatmentDoc}
                        einheit={viewingInvoice.einheit || viewingInvoice.treatmentDoc?.einheit || "SE"}
                        facePhoto={previewFacePhoto}
                      />
                    </div>
                  </div>
                )}
              </div>
            </MobileScaledPreview>
            <p className="text-center text-xs text-gray-400 mt-2 lg:hidden">Zum Teilen oben auf das Teilen-Symbol tippen</p>
            {/* Hidden TreatmentDocPreview for PDF generation (offscreen) */}
            {viewingInvoice.treatmentDoc && (
              <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
                <TreatmentDocPreview
                  id="invoice-treatment-doc-preview"
                  practice={viewPractice}
                  patient={viewingInvoice.patient}
                  treatmentDoc={viewingInvoice.treatmentDoc}
                  einheit={viewingInvoice.einheit || viewingInvoice.treatmentDoc?.einheit || "SE"}
                  facePhoto={previewFacePhoto}
                />
              </div>
            )}
            {/* Hidden file input for HV upload */}
            <input ref={hvUploadRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleHvUpload} />
            {/* Signature Modal — patient only */}
            {showSignatureModal && (
              <SignatureModal
                onComplete={handleSignatureComplete}
                onClose={() => setShowSignatureModal(false)}
                existingSignatures={viewingInvoice._signatures}
              />
            )}
            {/* Doctor signature modal for HV */}
            {showHvDoctorSign && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowHvDoctorSign(false)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-800">Unterschrift Ärzt:in</h3>
                    <button className="p-1 text-gray-400 hover:text-gray-600" onClick={() => setShowHvDoctorSign(false)}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <SignaturePad key="hv-doctor-sig" label="Unterschrift Ärzt:in" onSave={handleHvDoctorSignComplete} />
                  <button className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition py-1" onClick={() => setShowHvDoctorSign(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        <div className="mt-8 text-center text-xs text-gray-300">
          EPHIA Rechnungs-Prototyp · Daten von Patient:innen werden gemäß DSGVO gespeichert · <button className="text-gray-400 hover:text-gray-500 underline" onClick={() => navigate("/agb")}>AGB</button> · <button className="text-gray-400 hover:text-gray-500 underline" onClick={() => navigate("/datenschutz")}>Datenschutz</button> · <button className="text-gray-400 hover:text-gray-500 underline" onClick={() => navigate("/impressum")}>Impressum</button>
        </div>
      </div>}
    </div>
  );
}
