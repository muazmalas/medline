export type Locale = "en" | "ar";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    activeOrders: "Active orders",
    pendingVerification: "Pending verification",
    inDelivery: "In delivery",
    registeredPartners: "Registered organizations",
    healthcareLogistics: "Healthcare logistics",
    workspace: "Workspace",
    dashboard: "Dashboard",
    orders: "Orders",
    inventory: "Inventory",
    procurement: "Procurement",
    deliveries: "Deliveries",
    subscriptions: "Subscriptions",
    complaints: "Complaints",
    ratings: "Ratings",
    audit: "Audit log",
    partners: "Pharmacies & warehouses",
    users: "Users",
    documents: "Documents",
    verification: "Verification",
    settings: "Settings",
    management: "Management",
    signOut: "Sign out",
    search: "Search",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading",
    noRecords: "No records available.",
    active: "Active",
    hidden: "Hidden",
    restore: "Restore",
    hide: "Hide",
    submit: "Submit",
    status: "Status",
    action: "Action",
    queue: "Queue",
    directory: "Directory",
    overview: "overview",
    liveData: "Updated automatically",
    workflowGuidance:
      "Manage this workflow with clear ownership and auditable actions.",
    role_admin: "Admin",
    role_patient: "Patient",
    role_pharmacy: "Pharmacy",
    role_warehouse: "Warehouse",
    role_driver: "Driver",
    account: "Account",
    language: "Language",
    settingsDescription: "Control how MedLine keeps you informed.",
    interfaceDirection: "Interface direction",
    languageHint: "Switch between Arabic RTL and English LTR layout.",
    notifications: "Notifications",
    deliveryPreferences: "Delivery preferences",
    loadingPreferences: "Loading preferences...",
    channelHint: "Receive MedLine operational updates through this channel.",
    inAppNotifications: "In-app notifications",
    pushNotifications: "Push notifications",
    emailNotifications: "Email notifications",
    smsNotifications: "SMS notifications",
    adminSecurity: "Admin security",
    authenticatorProtection: "Authenticator protection",
    generateSetupSecret: "Generate setup secret",
    confirmTwoFactor: "Confirm 2FA",
    disableTwoFactor: "Disable 2FA",
    authenticatorCode: "6-digit authenticator code",
    localePending: "Locale saved locally; server profile update is pending.",
    secureOperations: "Secure operations",
    welcomeBack: "Welcome back",
    signInWorkspace: "Sign in to manage your MedLine workspace.",
    emailAddress: "Email address",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    switchLanguage: "Switch to Arabic",
    createAccount: "Create an account",
    authCodeLabel: "Authenticator code (admin 2FA)",
    optionalCode: "Optional 6-digit code",
    signIn: "Sign in to dashboard",
    signingIn: "Signing in...",
    forgotPassword: "Forgot password?",
    recoverPassword: "Recover your password",
    resetYourPassword: "Reset your password",
    recoveryHint: "We will send recovery instructions if the account exists.",
    resetHint: "Enter the token from your email and choose a new password.",
    resetToken: "Reset token",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    resetPassword: "Reset password",
    resetting: "Resetting...",
    sendRecovery: "Send recovery instructions",
    sending: "Sending...",
    backToSignIn: "Back to sign in",
    notificationsRefresh: "Refresh",
    noNotifications: "No notifications.",
    read: "Read",
    partnerAccount: "Organization account",
    annualSubscription: "Annual subscription",
    activeSubscriptionHint:
      "Keep your pharmacy or warehouse account active with a verified annual subscription.",
    currentStatus: "Current status",
    notActive: "Not active",
    validUntil: "Valid until",
    paymentReview: "Payment review",
    submitPaymentProof: "Submit payment proof",
    configuredPlan: "Configured plan",
    contactAdministrator: "Contact administrator",
    amount: "Amount",
    receiptFile: "Receipt file",
    submitForReview: "Submit for review",
    paymentSubmitted: "Payment proof submitted for administrator review.",
    loadingSubscription: "Loading...",
    unableToLoadSubscription: "Unable to load subscription.",
    uploadFailed: "Upload failed.",
    securityLoadFailed: "Unable to load administrator security status.",
    twoFactorSetupFailed: "Unable to start two-factor setup.",
    twoFactorDisableFailed: "Unable to disable two-factor authentication.",
    twoFactorEnabledMessage: "Two-factor authentication enabled.",
    twoFactorDisabledMessage: "Two-factor authentication disabled.",
    twoFactorDisableHint:
      "Two-factor authentication is enabled. Enter a current code to disable it.",
    twoFactorSecretHint:
      "Save the secret and enter a current authenticator code.",
    invalidAuthenticator: "Invalid authenticator code.",
  },
  ar: {
    activeOrders:
      "\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0646\u0634\u0637\u0629",
    pendingVerification:
      "\u0627\u0644\u062a\u062d\u0642\u0642\u0627\u062a \u0627\u0644\u0645\u0639\u0644\u0642\u0629",
    inDelivery: "\u0642\u064a\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    registeredPartners:
      "\u0627\u0644\u0645\u0646\u0638\u0645\u0627\u062a \u0627\u0644\u0645\u0633\u062c\u0644\u0629",
    healthcareLogistics:
      "\u0627\u0644\u0644\u0648\u062c\u0633\u062a\u064a\u0627 \u0627\u0644\u0635\u062d\u064a\u0629",
    securityLoadFailed:
      "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u062d\u0627\u0644\u0629 \u0623\u0645\u0627\u0646 \u0627\u0644\u0645\u062f\u064a\u0631.",
    twoFactorSetupFailed:
      "\u062a\u0639\u0630\u0631 \u0628\u062f\u0621 \u0625\u0639\u062f\u0627\u062f \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629.",
    twoFactorDisableFailed:
      "\u062a\u0639\u0630\u0631 \u062a\u0639\u0637\u064a\u0644 \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629.",
    twoFactorEnabledMessage:
      "\u062a\u0645 \u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629.",
    twoFactorDisabledMessage:
      "\u062a\u0645 \u062a\u0639\u0637\u064a\u0644 \u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629.",
    twoFactorDisableHint:
      "\u0627\u0644\u0645\u0635\u0627\u062f\u0642\u0629 \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629 \u0645\u0641\u0639\u0644\u0629. \u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062d\u0627\u0644\u064a \u0644\u062a\u0639\u0637\u064a\u0644\u0647\u0627.",
    twoFactorSecretHint:
      "\u0627\u062d\u0641\u0638 \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u0648\u0623\u062f\u062e\u0644 \u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062f\u0642 \u0627\u0644\u062d\u0627\u0644\u064a.",
    invalidAuthenticator:
      "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062f\u0642 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d.",
    workspace: "\u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644",
    dashboard: "\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645",
    orders: "\u0627\u0644\u0637\u0644\u0628\u0627\u062a",
    inventory: "\u0627\u0644\u0645\u062e\u0632\u0648\u0646",
    procurement: "\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a",
    deliveries: "\u0627\u0644\u062a\u0648\u0635\u064a\u0644\u0627\u062a",
    subscriptions:
      "\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a",
    complaints: "\u0627\u0644\u0634\u0643\u0627\u0648\u0649",
    ratings: "\u0627\u0644\u062a\u0642\u064a\u064a\u0645\u0627\u062a",
    audit: "\u0633\u062c\u0644 \u0627\u0644\u062a\u062f\u0642\u064a\u0642",
    partners:
      "\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0627\u062a \u0648\u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639\u0627\u062a",
    users: "\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646",
    documents: "\u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a",
    verification: "\u0627\u0644\u062a\u062d\u0642\u0642",
    settings: "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
    management: "\u0627\u0644\u0625\u062f\u0627\u0631\u0629",
    signOut:
      "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
    search: "\u0628\u062d\u062b",
    save: "\u062d\u0641\u0638",
    cancel: "\u0625\u0644\u063a\u0627\u0621",
    loading:
      "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u064a\u0644",
    noRecords:
      "\u0644\u0627 \u062a\u0648\u062c\u062f \u0633\u062c\u0644\u0627\u062a \u0645\u062a\u0627\u062d\u0629.",
    active: "\u0646\u0634\u0637",
    hidden: "\u0645\u062e\u0641\u064a",
    restore: "\u0627\u0633\u062a\u0639\u0627\u062f\u0629",
    hide: "\u0625\u062e\u0641\u0627\u0621",
    submit: "\u0625\u0631\u0633\u0627\u0644",
    status: "\u0627\u0644\u062d\u0627\u0644\u0629",
    action: "\u0627\u0644\u0625\u062c\u0631\u0627\u0621",
    queue: "\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    directory: "\u0627\u0644\u062f\u0644\u064a\u0644",
    overview: "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629",
    liveData:
      "\u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0628\u0627\u0634\u0631\u0629",
    workflowGuidance:
      "\u0623\u062f\u0631 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 \u0628\u0645\u0644\u0643\u064a\u0629 \u0648\u0627\u0636\u062d\u0629 \u0648\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062a\u062f\u0642\u064a\u0642",
    role_admin: "\u0627\u0644\u0645\u062f\u064a\u0631",
    role_patient: "\u0627\u0644\u0645\u0631\u064a\u0636",
    role_pharmacy: "\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629",
    role_warehouse: "\u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639",
    role_driver: "\u0627\u0644\u0633\u0627\u0626\u0642",
    account: "\u0627\u0644\u062d\u0633\u0627\u0628",
    language: "\u0627\u0644\u0644\u063a\u0629",
    settingsDescription:
      "\u062a\u062d\u0643\u0645 \u0641\u064a \u0637\u0631\u064a\u0642\u0629 \u0625\u0628\u0644\u0627\u063a \u0645\u064a\u062f\u0644\u0627\u064a\u0646 \u0644\u0643",
    interfaceDirection:
      "\u0627\u062a\u062c\u0627\u0647 \u0627\u0644\u0648\u0627\u062c\u0647\u0629",
    languageHint:
      "\u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0628\u064a\u0646 RTL \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0648LTR \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629",
    notifications: "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a",
    deliveryPreferences:
      "\u062a\u0641\u0636\u064a\u0644\u0627\u062a \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    loadingPreferences:
      "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u062a\u0641\u0636\u064a\u0644\u0627\u062a...",
    channelHint:
      "\u062a\u0644\u0642\u064a \u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0645\u064a\u062f\u0644\u0627\u064a\u0646 \u0639\u0628\u0631 \u0647\u0630\u0647 \u0627\u0644\u0642\u0646\u0627\u0629",
    inAppNotifications:
      "\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062f\u0627\u062e\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642",
    pushNotifications:
      "\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0641\u0648\u0631\u064a\u0629",
    emailNotifications:
      "\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0628\u0627\u0644\u0628\u0631\u064a\u062f",
    smsNotifications: "\u0625\u0634\u0639\u0627\u0631\u0627\u062a SMS",
    adminSecurity:
      "\u0623\u0645\u0627\u0646 \u0627\u0644\u0645\u062f\u064a\u0631",
    authenticatorProtection:
      "\u062d\u0645\u0627\u064a\u0629 \u0628\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u0635\u0627\u062f\u0642",
    generateSetupSecret:
      "\u062a\u0648\u0644\u064a\u062f \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u0625\u0639\u062f\u0627\u062f",
    confirmTwoFactor: "\u062a\u0623\u0643\u064a\u062f 2FA",
    disableTwoFactor: "\u062a\u0639\u0637\u064a\u0644 2FA",
    authenticatorCode:
      "\u0631\u0645\u0632 \u0645\u0635\u0627\u062f\u0642 \u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645",
    secureOperations: "\u062a\u0634\u063a\u064a\u0644 \u0622\u0645\u0646",
    welcomeBack:
      "\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0639\u0648\u062f\u062a\u0643",
    signInWorkspace:
      "\u0633\u062c\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0625\u062f\u0627\u0631\u0629 \u0645\u0633\u0627\u062d\u0629 \u0639\u0645\u0644 MedLine.",
    emailAddress:
      "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
    password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    passwordPlaceholder: "\u0623\u062f\u062e\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    switchLanguage: "\u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629",
    createAccount: "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628",
    authCodeLabel:
      "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062f\u0642 (2FA \u0644\u0644\u0645\u062f\u064a\u0631)",
    optionalCode:
      "\u0631\u0645\u0632 \u0627\u062e\u062a\u064a\u0627\u0631\u064a \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645",
    signIn:
      "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
    signingIn:
      "\u062c\u0627\u0631\u064d \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644...",
    forgotPassword:
      "\u0646\u0633\u064a\u062a \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631\u061f",
    recoverPassword:
      "\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    resetYourPassword:
      "\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    recoveryHint:
      "\u0633\u0646\u0631\u0633\u0644 \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u062d\u0633\u0627\u0628 \u0645\u0648\u062c\u0648\u062f\u0627\u064b",
    resetHint:
      "\u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0631\u0633\u0644 \u0625\u0644\u0649 \u0628\u0631\u064a\u062f\u0643 \u0648\u0627\u062e\u062a\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629.",
    resetToken:
      "\u0631\u0645\u0632 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0639\u064a\u064a\u0646",
    newPassword:
      "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629",
    confirmPassword:
      "\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    resetPassword:
      "\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    resetting:
      "\u062c\u0627\u0631\u064d \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0639\u064a\u064a\u0646...",
    sendRecovery:
      "\u0625\u0631\u0633\u0627\u0644 \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0639\u0627\u062f\u0629",
    sending:
      "\u062c\u0627\u0631\u064d \u0627\u0644\u0625\u0631\u0633\u0627\u0644...",
    backToSignIn:
      "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
    notificationsRefresh: "\u062a\u062d\u062f\u064a\u062b",
    noNotifications:
      "\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u0634\u0639\u0627\u0631\u0627\u062a",
    read: "\u0645\u0642\u0631\u0648\u0621",
    partnerAccount:
      "\u062d\u0633\u0627\u0628 \u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629 \u0623\u0648 \u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639",
    annualSubscription:
      "\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0627\u0644\u0633\u0646\u0648\u064a",
    activeSubscriptionHint:
      "\u062d\u0627\u0641\u0638 \u0639\u0644\u0649 \u0646\u0634\u0627\u0637 \u062d\u0633\u0627\u0628 \u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629 \u0623\u0648 \u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639 \u0645\u0646 \u062e\u0644\u0627\u0644 \u0627\u0634\u062a\u0631\u0627\u0643 \u0633\u0646\u0648\u064a \u0645\u0648\u062b\u0642.",
    currentStatus:
      "\u0627\u0644\u062d\u0627\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629",
    notActive: "\u063a\u064a\u0631 \u0646\u0634\u0637",
    validUntil: "\u0635\u0627\u0644\u062d \u062d\u062a\u0649",
    paymentReview:
      "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u062f\u0641\u0639",
    submitPaymentProof:
      "\u0625\u0631\u0633\u0627\u0644 \u0625\u062b\u0628\u0627\u062a \u0627\u0644\u062f\u0641\u0639",
    configuredPlan:
      "\u0627\u0644\u062e\u0637\u0629 \u0627\u0644\u0645\u0643\u0648\u0646\u0629",
    contactAdministrator:
      "\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0645\u0633\u0624\u0648\u0644",
    amount: "\u0627\u0644\u0645\u0628\u0644\u063a",
    receiptFile:
      "\u0645\u0644\u0641 \u0627\u0644\u0625\u064a\u0635\u0627\u0644",
    submitForReview:
      "\u0625\u0631\u0633\u0627\u0644 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629",
    paymentSubmitted:
      "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0625\u062b\u0628\u0627\u062a \u0627\u0644\u062f\u0641\u0639 \u0625\u0644\u0649 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629.",
    loadingSubscription:
      "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
    unableToLoadSubscription:
      "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643.",
    uploadFailed:
      "\u0641\u0634\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644",
  },
};

const extraMessages: Record<Locale, Record<string, string>> = {
  en: {
    record: "Record",
    details: "Details",
    loadingRecords: "Loading records...",
    noRecordsYet: "No records available yet.",
    medicineId: "Medicine ID",
    quantity: "Quantity",
    unitPrice: "Unit price",
    lowStock: "Low stock",
    saveStock: "Save stock",
    createRecord: "Create record",
    view: "View",
    download: "Download",
    receipt: "Receipt",
    approve: "Approve",
    reject: "Reject",
    accept: "Accept",
    reassign: "Reassign",
    review: "Review",
    resolve: "Resolve",
    suspend: "Suspend",
    reactivate: "Reactivate",
    exportCsv: "Export CSV",
    catalogAdministration: "Catalog administration",
    medicineCatalog: "Medicine catalog",
    bilingualRecords: "Manage bilingual product records and availability.",
    exportCatalog: "Export CSV",
    chooseCsv: "Choose CSV",
    importCsv: "Import CSV",
    newRecord: "New record",
    addMedicine: "Add medicine",
    englishName: "English name",
    arabicName: "Arabic name",
    image: "Image",
    prescription: "Prescription",
    createMedicine: "Create medicine",
    activeMedicines: "Active medicines",
    noPrescription: "No prescription",
    deactivate: "Deactivate",
    categoryTaxonomy: "Catalog taxonomy",
    categories: "Medicine categories",
    slug: "Slug",
    addCategory: "Add category",
    referencedCategories: "Referenced categories update safely.",
    edit: "Edit",
    catalogRefinement: "Catalog refinement",
    editMedicine: "Edit medicine",
    medicine: "Medicine",
    selectMedicine: "Select a medicine",
    profile: "Profile",
    pharmacies: "Pharmacies",
    warehouses: "Warehouses",
    subscriptionReviews: "Subscription reviews",
    openUserMenu: "Open user menu",
    yourProfile: "Your profile",
    profileDescription: "Manage your contact details and account security.",
    personalDetails: "Personal details",
    profileInformation: "Profile information",
    fullName: "Full name",
    phoneNumber: "Phone number",
    saveProfile: "Save profile",
    savingProfile: "Saving profile...",
    profileUpdated: "Profile updated.",
    profileUpdateFailed: "Unable to update profile.",
    security: "Security",
    changePassword: "Change password",
    currentPassword: "Current password",
    confirmNewPassword: "Confirm new password",
    passwordHint: "Use at least 8 characters and avoid reusing your current password.",
    changingPassword: "Changing password...",
    passwordChanged: "Password changed.",
    passwordChangeFailed: "Unable to change password.",
    active: "Active",
    saveMedicine: "Save medicine",
  },
  ar: {
    record: "\u0633\u062c\u0644",
    details: "\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644",
    loadingRecords:
      "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0633\u062c\u0644\u0627\u062a...",
    noRecordsYet:
      "\u0644\u0627 \u062a\u0648\u062c\u062f \u0633\u062c\u0644\u0627\u062a \u0645\u062a\u0627\u062d\u0629 \u062d\u0627\u0644\u064a\u0627\u064b",
    medicineId: "\u0645\u0639\u0631\u0641 \u0627\u0644\u062f\u0648\u0627\u0621",
    quantity: "\u0627\u0644\u0643\u0645\u064a\u0629",
    unitPrice: "\u0633\u0639\u0631 \u0627\u0644\u0648\u062d\u062f\u0629",
    lowStock:
      "\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0644\u0644\u0645\u062e\u0632\u0648\u0646",
    saveStock: "\u062d\u0641\u0638 \u0627\u0644\u0645\u062e\u0632\u0648\u0646",
    createRecord: "\u0625\u0646\u0634\u0627\u0621 \u0633\u062c\u0644",
    view: "\u0639\u0631\u0636",
    download: "\u062a\u0646\u0632\u064a\u0644",
    receipt: "\u0625\u064a\u0635\u0627\u0644",
    approve: "\u0645\u0648\u0627\u0641\u0642\u0629",
    reject: "\u0631\u0641\u0636",
    accept: "\u0642\u0628\u0648\u0644",
    reassign: "\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646",
    review: "\u0645\u0631\u0627\u062c\u0639\u0629",
    resolve: "\u062d\u0644",
    suspend: "\u062a\u0639\u0644\u064a\u0642",
    reactivate: "\u0625\u0639\u0627\u062f\u0629 \u062a\u0641\u0639\u064a\u0644",
    exportCsv: "\u062a\u0635\u062f\u064a\u0631 CSV",
    catalogAdministration:
      "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c",
    medicineCatalog:
      "\u0643\u062a\u0644\u0648\u062c \u0627\u0644\u0623\u062f\u0648\u064a\u0629",
    bilingualRecords:
      "\u0625\u062f\u0627\u0631\u0629 \u0633\u062c\u0644\u0627\u062a \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u062b\u0646\u0627\u0626\u064a\u0629 \u0648\u062a\u0648\u0641\u0631\u0647\u0627.",
    exportCatalog: "\u062a\u0635\u062f\u064a\u0631 CSV",
    chooseCsv: "\u0627\u062e\u062a\u064a\u0627\u0631 CSV",
    importCsv: "\u0627\u0633\u062a\u064a\u0631\u0627\u062f CSV",
    newRecord: "\u0633\u062c\u0644 \u062c\u062f\u064a\u062f",
    addMedicine: "\u0625\u0636\u0627\u0641\u0629 \u062f\u0648\u0627\u0621",
    englishName:
      "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629",
    arabicName:
      "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    image: "\u0627\u0644\u0635\u0648\u0631\u0629",
    prescription: "\u0648\u0635\u0641\u0629 \u0637\u0628\u064a\u0629",
    createMedicine: "\u0625\u0646\u0634\u0627\u0621 \u062f\u0648\u0627\u0621",
    activeMedicines:
      "\u0627\u0644\u0623\u062f\u0648\u064a\u0629 \u0627\u0644\u0646\u0634\u0637\u0629",
    noPrescription: "\u0628\u062f\u0648\u0646 \u0648\u0635\u0641\u0629",
    deactivate:
      "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062a\u0641\u0639\u064a\u0644",
    categoryTaxonomy:
      "\u062a\u0635\u0646\u064a\u0641 \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c",
    categories:
      "\u0641\u0626\u0627\u062a \u0627\u0644\u0623\u062f\u0648\u064a\u0629",
    slug: "\u0627\u0644\u0645\u0639\u0631\u0651\u0641",
    addCategory: "\u0625\u0636\u0627\u0641\u0629 \u0641\u0626\u0629",
    referencedCategories:
      "\u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0641\u0626\u0627\u062a \u0627\u0644\u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0623\u0645\u0627\u0646.",
    edit: "\u062a\u0639\u062f\u064a\u0644",
    catalogRefinement:
      "\u062a\u0646\u0642\u064a\u062d \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c",
    editMedicine:
      "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u062f\u0648\u0627\u0621",
    medicine: "\u0627\u0644\u062f\u0648\u0627\u0621",
    selectMedicine:
      "\u0627\u062e\u062a\u064a\u0627\u0631 \u062f\u0648\u0627\u0621",
    profile: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a",
    pharmacies: "\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0627\u062a",
    warehouses: "\u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639\u0627\u062a",
    subscriptionReviews: "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a",
    openUserMenu: "\u0641\u062a\u062d \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645",
    yourProfile: "\u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a",
    profileDescription:
      "\u0625\u062f\u0627\u0631\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0648\u0623\u0645\u0627\u0646 \u0627\u0644\u062d\u0633\u0627\u0628.",
    personalDetails: "\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u062e\u0635\u064a\u0629",
    profileInformation: "\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a",
    fullName: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644",
    phoneNumber: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641",
    saveProfile: "\u062d\u0641\u0638 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a",
    savingProfile: "\u062c\u0627\u0631\u064d \u062d\u0641\u0638 \u0627\u0644\u0645\u0644\u0641...",
    profileUpdated: "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a.",
    profileUpdateFailed: "\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a.",
    security: "\u0627\u0644\u0623\u0645\u0627\u0646",
    changePassword: "\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
    currentPassword: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629",
    confirmNewPassword: "\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629",
    passwordHint:
      "\u0627\u0633\u062a\u062e\u062f\u0645 8 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0648\u062a\u062c\u0646\u0628 \u0625\u0639\u0627\u062f\u0629 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.",
    changingPassword: "\u062c\u0627\u0631\u064d \u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631...",
    passwordChanged: "\u062a\u0645 \u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.",
    passwordChangeFailed: "\u062a\u0639\u0630\u0631 \u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.",
    active: "\u0646\u0634\u0637",
    saveMedicine: "\u062d\u0641\u0638 \u0627\u0644\u062f\u0648\u0627\u0621",
  },
};

const catalogFieldMessages: Record<Locale, Record<string, string>> = {
  en: {
    manufacturer: "Manufacturer",
    form: "Form",
    dosage: "Dosage",
    code: "Code",
    cancel: "Cancel",
    save: "Save",
  },
  ar: {
    manufacturer:
      "\u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u0635\u0646\u0639\u0629",
    form: "\u0627\u0644\u0634\u0643\u0644",
    dosage: "\u0627\u0644\u062c\u0631\u0639\u0629",
    code: "\u0627\u0644\u0631\u0645\u0632",
    cancel: "\u0625\u0644\u063a\u0627\u0621",
    save: "\u062d\u0641\u0638",
  },
};

const adminMessages: Record<Locale, Record<string, string>> = {
  en: {
    trustSafety: "Trust & safety",
    ratingsModeration: "Ratings moderation",
    ratingsGuidance:
      "Review feedback and hide content that violates MedLine policy. Hidden ratings remain recoverable.",
    ratings: "Ratings",
    feedbackQueue: "Feedback queue",
    auditedActions: "Audited actions",
    searchFeedback: "Search feedback, order, or author...",
    order: "Order",
    authorComment: "Author and comment",
    hidden: "Hidden",
    visible: "Visible",
    noRatings: "No ratings available.",
    restore: "Restore",
    hide: "Hide",
    ratingHidden: "Rating hidden.",
    ratingRestored: "Rating restored.",
    hideReason: "Reason for hiding this rating:",
    unsafeContent: "Inappropriate or unsafe content",
  },
  ar: {
    trustSafety: "الثقة والسلامة",
    ratingsModeration: "مراجعة التقييمات",
    ratingsGuidance:
      "راجع الملاحظات وأخفِ المحتوى المخالف لسياسة ميدلاين. تبقى التقييمات المخفية قابلة للاستعادة.",
    ratings: "التقييمات",
    feedbackQueue: "قائمة الملاحظات",
    auditedActions: "إجراءات مدققة",
    searchFeedback: "ابحث في الملاحظات أو الطلب أو الكاتب...",
    order: "الطلب",
    authorComment: "الكاتب والتعليق",
    hidden: "مخفي",
    visible: "ظاهر",
    noRatings: "لا توجد تقييمات متاحة.",
    restore: "استعادة",
    hide: "إخفاء",
    ratingHidden: "تم إخفاء التقييم.",
    ratingRestored: "تمت استعادة التقييم.",
    hideReason: "سبب إخفاء التقييم:",
    unsafeContent: "محتوى غير مناسب أو غير آمن",
  },
};

const healthMessages: Record<Locale, Record<string, string>> = {
  en: {
    notificationHealth: "Notification health",
    last24Hours: "Last 24 hours",
    operationalView: "Operational view",
    notificationAttempts: "Notification attempts",
    notificationFailures: "Notification failures",
    noNotificationFailures: "No notification delivery failures recorded.",
    notificationDelivery: "Notification delivery",
    deliveryFailure: "delivery failure",
    provider: "provider",
  },
  ar: {
    notificationHealth: "حالة الإشعارات",
    last24Hours: "آخر 24 ساعة",
    operationalView: "عرض تشغيلي",
    notificationAttempts: "محاولات الإشعار",
    notificationFailures: "فشل الإشعارات",
    noNotificationFailures: "لم يتم تسجيل أي فشل في توصيل الإشعارات.",
    notificationDelivery: "توصيل الإشعار",
    deliveryFailure: "فشل التوصيل",
    provider: "المزود",
  },
};

const dashboardMessages: Record<Locale, Record<string, string>> = {
  en: {
    operationalAlerts: "Operational alerts",
    itemsAttention: "Items requiring attention",
    noActiveAlerts: "No active alerts.",
    operationalAlert: "Operational alert",
    info: "INFO",
    critical: "CRITICAL",
    catalog: "Catalog",
    medicineSearch: "Medicine search",
    searchPlaceholder: "Search by medicine, manufacturer, or code...",
    searching: "Searching the catalog...",
    noMedicines: "No medicines found.",
    manufacturerPending: "Manufacturer pending",
    prescription: "Prescription",
    noPrescription: "No prescription",
    tryInstead: "Try instead:",
    operations: "Operations",
    roleMetrics: "Role metrics",
    liveData: "Updated automatically",
    ordersInScope: "orders in scope",
    activeDeliveries: "active deliveries",
    itemsPending: "items pending",
    lowStockItems: "low-stock items",
    guidance: "Live catalog and role-scoped operational metrics.",
    adminDashboardGuidance: "Monitor platform operations, approvals, deliveries, and partner performance.",
    pharmacyDashboardGuidance: "Review customer orders, stock pressure, replenishment, and outgoing deliveries.",
    warehouseDashboardGuidance: "Focus on procurement requests, available stock, and pharmacy fulfilment.",
    driverDashboardGuidance: "Continue assigned deliveries or choose a vehicle-compatible order after reviewing its road route.",
    patientDashboardGuidance: "Find an open pharmacy, create an order, and follow active deliveries.",
    supportDashboardGuidance: "Prioritize customer issues and operational follow-up.",
    reviewOperations: "Review operations",
    reviewOrders: "Review incoming orders",
    reviewProcurement: "Review procurement requests",
    findDelivery: "Find a delivery",
    createMedicineOrder: "Create medicine order",
    reviewComplaints: "Review complaints",
    totalOrders: "Total orders",
    awaitingReview: "Awaiting review",
    completed: "Completed",
    availableJobs: "Available orders",
    inventoryItems: "Inventory items",
    procurementInProgress: "Procurement in progress",
    fulfilledRequests: "Fulfilled requests",
    claimedByDriver: "Claimed by driver",
    readyForPickup: "Ready for pickup",
    sendPickupPinHint: "Open a claimed delivery, mark it ready, and email its 4-digit pickup PIN.",
    pickupPinSentHint: "Pickup PIN sent; waiting for verification.",
    sendPickupPin: "Mark ready & send PIN",
    sendingPickupPin: "Sending pickup PIN...",
    rolePriorities: "Your operational priorities",
    sharedPharmacyMap: "Pharmacy availability map",
    sharedPharmacyMapHint: "Browse approved pharmacies and filter by who is open now in Damascus.",
    searchPharmacies: "Search pharmacies",
    allPharmacies: "All pharmacies",
    openNow: "Open now",
    closedNow: "Closed now",
    noMappedPharmacies: "No pharmacies match these filters.",
    todayHours: "Today's hours",
    hoursNotRecorded: "Hours not recorded",
    openUntil: "Open until",
    openInMap: "Open in map",
    availableDeliveryMap: "Available delivery routes",
    availableDeliveryMapHint: "Select an order to review its calculated road route, distance, and fee before accepting it.",
    searchDeliveryJobs: "Search available orders",
    allSchedules: "All schedules",
    asapOnly: "ASAP only",
    scheduledOnly: "Scheduled only",
    pickup: "Pickup",
    dropoff: "Drop-off",
    routePreview: "Road distance",
    viewDeliveryDetails: "Review order & route",
    reviewOrderBeforeAccepting: "Review order before accepting",
    acceptOrderHint: "Confirm the road route, pickup manifest, vehicle type, and route-based fee below.",
    acceptThisOrder: "Accept this order",
    acceptingOrder: "Accepting order...",
    orderAcceptedForDelivery: "Order accepted. It is now assigned to you for delivery.",
    unableToAcceptOrder: "Unable to accept this order.",
    noAvailableJobs: "No available orders currently match your vehicle and filters.",
    myActiveDeliveries: "My active deliveries",
    activeDeliveryListHint: "Continue accepted deliveries and open the next verification or status step.",
    noActiveDeliveries: "You have no active deliveries right now.",
    assignedDeliveries: "Assigned deliveries",
    assignedDeliveryHistoryHint: "Review your active assignments and completed delivery history.",
    deliveryTime: "Delivery time",
    availableForJobs: "Available for new orders",
    unavailableForJobs: "Not accepting new orders",
    availabilityHint: "Turn availability on to load and accept compatible orders.",
    updatingAvailability: "Updating availability...",
  },
  ar: {
    operationalAlerts: "التنبيهات التشغيلية",
    itemsAttention: "عناصر تتطلب الانتباه",
    noActiveAlerts: "لا توجد تنبيهات نشطة.",
    operationalAlert: "تنبيه تشغيلي",
    info: "معلومات",
    critical: "حرج",
    catalog: "الكتالوج",
    medicineSearch: "البحث عن دواء",
    searchPlaceholder: "ابحث عن الدواء أو الشركة المصنعة أو الرمز...",
    searching: "جارٍ البحث في الكتالوج...",
    noMedicines: "لم يتم العثور على أدوية.",
    manufacturerPending: "الشركة المصنعة غير محددة",
    prescription: "وصفة طبية",
    noPrescription: "بدون وصفة",
    tryInstead: "جرّب بدلاً من ذلك:",
    operations: "العمليات",
    roleMetrics: "مؤشرات الدور",
    liveData: "تحديث تلقائي",
    ordersInScope: "طلبات ضمن النطاق",
    activeDeliveries: "توصيلات نشطة",
    itemsPending: "عناصر قيد الانتظار",
    lowStockItems: "عناصر منخفضة المخزون",
    guidance: "كتالوج مباشر ومؤشرات تشغيلية حسب الدور.",
    adminDashboardGuidance: "راقب عمليات المنصة والموافقات والتوصيلات وأداء الشركاء.",
    pharmacyDashboardGuidance: "راجع طلبات العملاء وضغط المخزون والتزويد والتوصيلات الصادرة.",
    warehouseDashboardGuidance: "ركّز على طلبات المشتريات والمخزون المتاح وتلبية احتياجات الصيدليات.",
    driverDashboardGuidance: "تابع التوصيلات المعيّنة أو اختر طلباً متوافقاً مع مركبتك بعد مراجعة مسار الطرق.",
    patientDashboardGuidance: "اعثر على صيدلية مفتوحة وأنشئ طلباً وتابع التوصيلات النشطة.",
    supportDashboardGuidance: "رتّب مشكلات العملاء والمتابعة التشغيلية حسب الأولوية.",
    reviewOperations: "مراجعة العمليات",
    reviewOrders: "مراجعة الطلبات الواردة",
    reviewProcurement: "مراجعة طلبات المشتريات",
    findDelivery: "البحث عن توصيل",
    createMedicineOrder: "إنشاء طلب أدوية",
    reviewComplaints: "مراجعة الشكاوى",
    totalOrders: "إجمالي الطلبات",
    awaitingReview: "بانتظار المراجعة",
    completed: "مكتمل",
    availableJobs: "طلبات متاحة",
    inventoryItems: "عناصر المخزون",
    procurementInProgress: "مشتريات قيد التنفيذ",
    fulfilledRequests: "طلبات تم تلبيتها",
    claimedByDriver: "استلمها السائق",
    readyForPickup: "جاهز للاستلام",
    sendPickupPinHint: "افتح التوصيل الذي استلمه السائق، وأكد جاهزيته، ثم أرسل رمز الاستلام المكون من 4 أرقام.",
    pickupPinSentHint: "تم إرسال رمز الاستلام؛ بانتظار التحقق.",
    sendPickupPin: "تأكيد الجاهزية وإرسال الرمز",
    sendingPickupPin: "جارٍ إرسال رمز الاستلام...",
    rolePriorities: "أولوياتك التشغيلية",
    sharedPharmacyMap: "خريطة توفر الصيدليات",
    sharedPharmacyMapHint: "تصفح الصيدليات المعتمدة وصفِّ النتائج حسب الصيدليات المفتوحة الآن في دمشق.",
    searchPharmacies: "البحث عن صيدلية",
    allPharmacies: "كل الصيدليات",
    openNow: "مفتوحة الآن",
    closedNow: "مغلقة الآن",
    noMappedPharmacies: "لا توجد صيدليات مطابقة لهذه المرشحات.",
    todayHours: "ساعات اليوم",
    hoursNotRecorded: "ساعات العمل غير مسجلة",
    openUntil: "مفتوحة حتى",
    openInMap: "فتح في الخريطة",
    availableDeliveryMap: "مسارات التوصيل المتاحة",
    availableDeliveryMapHint: "اختر طلباً لمراجعة مساره الفعلي على الطرق والمسافة والأجرة قبل قبوله.",
    searchDeliveryJobs: "البحث في الطلبات المتاحة",
    allSchedules: "كل المواعيد",
    asapOnly: "العاجلة فقط",
    scheduledOnly: "المجدولة فقط",
    pickup: "الاستلام",
    dropoff: "التسليم",
    routePreview: "المسافة على الطرق",
    viewDeliveryDetails: "مراجعة الطلب والمسار",
    reviewOrderBeforeAccepting: "راجع الطلب قبل قبوله",
    acceptOrderHint: "تأكد من مسار الطرق وقائمة الاستلام ونوع المركبة والأجرة المحسوبة أدناه.",
    acceptThisOrder: "قبول هذا الطلب",
    acceptingOrder: "جارٍ قبول الطلب...",
    orderAcceptedForDelivery: "تم قبول الطلب وتعيينه لك للتوصيل.",
    unableToAcceptOrder: "تعذر قبول هذا الطلب.",
    noAvailableJobs: "لا توجد طلبات متاحة متوافقة مع مركبتك والمرشحات حالياً.",
    myActiveDeliveries: "توصيلاتي النشطة",
    activeDeliveryListHint: "تابع التوصيلات المقبولة وافتح خطوة التحقق أو تحديث الحالة التالية.",
    noActiveDeliveries: "لا توجد لديك توصيلات نشطة حالياً.",
    assignedDeliveries: "التوصيلات المعيّنة",
    assignedDeliveryHistoryHint: "راجع مهامك النشطة وسجل التوصيلات المكتملة.",
    deliveryTime: "وقت التوصيل",
    availableForJobs: "متاح لطلبات جديدة",
    unavailableForJobs: "غير متاح لطلبات جديدة",
    availabilityHint: "فعّل حالة التوفر لتحميل الطلبات المتوافقة وقبولها.",
    updatingAvailability: "جارٍ تحديث حالة التوفر...",
  },
};

const deliveryMessages: Record<Locale, Record<string, string>> = {
  en: {
    deliveryDetail: "Delivery detail",
    backToDeliveries: "Back to deliveries",
    assignment: "Assignment",
    operationalDelivery: "Operational delivery",
    privateAddress: "Private address",
    address: "Address",
    total: "Total",
    driverAssignment: "Driver assignment",
    assigned: "Assigned",
    awaitingDriver: "Awaiting driver",
    liveLocation: "Live location",
    driverLocation: "Driver location",
    latestActivePosition: "Latest active position received.",
    updated: "Updated",
    pending: "Pending",
    openMap: "Open map",
    locationActiveOnly: "Location is available only while delivery is active.",
    eventTimeline: "Event timeline",
    deliveryProgress: "Delivery progress",
    noDeliveryEvents: "No delivery events recorded yet.",
    deliveryRecipient: "Delivery recipient",
    destinationContact: "Destination contact",
    recipientName: "Recipient name",
    emailAddress: "Email address",
    phoneNumber: "Phone number",
    deliveryDestination: "Delivery destination",
    openDestinationMap: "Open destination in map",
    pickupOrganization: "Pickup organization",
    contactName: "Contact name",
    organizationAddress: "Organization address",
    openPickupMap: "Open pickup in map",
    notProvided: "Not provided",
    patient: "Patient",
    pharmacy: "Pharmacy",
    warehouse: "Warehouse",
  },
  ar: {
    deliveryDetail:
      "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    backToDeliveries:
      "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u0648\u0635\u064a\u0644\u0627\u062a",
    assignment: "\u0627\u0644\u062a\u0639\u064a\u064a\u0646",
    operationalDelivery:
      "\u062a\u0648\u0635\u064a\u0644 \u062a\u0634\u063a\u064a\u0644\u064a",
    privateAddress: "\u0639\u0646\u0648\u0627\u0646 \u062e\u0627\u0635",
    assigned: "\u0645\u0639\u064a\u0651\u0646",
    awaitingDriver:
      "\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0633\u0627\u0626\u0642",
    liveLocation:
      "\u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u0628\u0627\u0634\u0631",
    driverLocation:
      "\u0645\u0648\u0642\u0639 \u0627\u0644\u0633\u0627\u0626\u0642",
    latestActivePosition:
      "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0622\u062e\u0631 \u0645\u0648\u0642\u0639 \u0646\u0634\u0637.",
    updated: "\u062a\u062d\u062f\u064a\u062b",
    pending: "\u0645\u0639\u0644\u0651\u0642",
    openMap: "\u0641\u062a\u062d \u0627\u0644\u062e\u0631\u064a\u0637\u0629",
    locationActiveOnly:
      "\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u062a\u0627\u062d \u0641\u0642\u0637 \u0623\u062b\u0646\u0627\u0621 \u0646\u0634\u0627\u0637 \u0627\u0644\u062a\u0648\u0635\u064a\u0644.",
    eventTimeline:
      "\u0627\u0644\u062e\u0637 \u0627\u0644\u0632\u0645\u0646\u064a \u0644\u0644\u0623\u062d\u062f\u0627\u062b",
    deliveryProgress:
      "\u062a\u0642\u062f\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    noDeliveryEvents:
      "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0623\u062d\u062f\u0627\u062b \u0644\u0644\u062a\u0648\u0635\u064a\u0644 \u0628\u0639\u062f.",
    deliveryRecipient: "\u0645\u0633\u062a\u0644\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    destinationContact: "\u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0641\u064a \u0627\u0644\u0648\u062c\u0647\u0629",
    recipientName: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u0644\u0645",
    emailAddress: "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
    phoneNumber: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641",
    deliveryDestination: "\u0648\u062c\u0647\u0629 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    openDestinationMap: "\u0641\u062a\u062d \u0627\u0644\u0648\u062c\u0647\u0629 \u0641\u064a \u0627\u0644\u062e\u0631\u064a\u0637\u0629",
    pickupOrganization: "\u062c\u0647\u0629 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645",
    contactName: "\u0627\u0633\u0645 \u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644",
    organizationAddress: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0624\u0633\u0633\u0629",
    openPickupMap: "\u0641\u062a\u062d \u0645\u0648\u0642\u0639 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645 \u0641\u064a \u0627\u0644\u062e\u0631\u064a\u0637\u0629",
    notProvided: "\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631",
    patient: "\u0645\u0631\u064a\u0636",
    pharmacy: "\u0635\u064a\u062f\u0644\u064a\u0629",
    warehouse: "\u0645\u0633\u062a\u0648\u062f\u0639",
  },
};

deliveryMessages.ar.address = "\u0627\u0644\u0639\u0646\u0648\u0627\u0646";
deliveryMessages.ar.total = "\u0627\u0644\u0645\u062c\u0645\u0648\u0639";
deliveryMessages.ar.driverAssignment =
  "\u062a\u0639\u064a\u064a\u0646 \u0627\u0644\u0633\u0627\u0626\u0642";

const procurementMessages: Record<Locale, Record<string, string>> = {
  en: {
    back: "Back",
    procurementDetail: "Procurement detail",
    backToProcurement: "Back to procurement",
    items: "Items",
    requestedStock: "Requested stock",
    noItems: "No items recorded.",
    requested: "Requested",
    accepted: "Accepted",
    deliveryAddress: "Delivery address",
    notRecorded: "Not recorded",
    total: "Total",
    delivery: "Delivery",
    notCreated: "Not created",
    noDeliveryEvents: "No delivery events recorded yet.",
  },
  ar: {
    back: "\u0631\u062c\u0648\u0639",
    procurementDetail:
      "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062a\u0648\u0631\u064a\u062f",
    backToProcurement:
      "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u0648\u0631\u064a\u062f",
    items: "\u0627\u0644\u0639\u0646\u0627\u0635\u0631",
    requestedStock:
      "\u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    noItems:
      "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0639\u0646\u0627\u0635\u0631.",
    requested: "\u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    accepted: "\u0627\u0644\u0645\u0642\u0628\u0648\u0644",
    deliveryAddress:
      "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062a\u0633\u0644\u064a\u0645",
    notRecorded: "\u063a\u064a\u0631 \u0645\u0633\u062c\u0644",
    total: "\u0627\u0644\u0645\u062c\u0645\u0648\u0639",
    delivery: "\u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    notCreated:
      "\u0644\u0645 \u064a\u062a\u0645 \u0625\u0646\u0634\u0627\u0624\u0647",
    noDeliveryEvents:
      "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0623\u062d\u062f\u0627\u062b \u0644\u0644\u062a\u0648\u0635\u064a\u0644 \u0628\u0639\u062f.",
  },
};

const supportMessages: Record<Locale, Record<string, string>> = {
  en: {
    supportCase: "Support case",
    backToComplaints: "Back to complaints",
    caseDescription: "Case description",
    resolution: "Resolution",
    privateEvidence: "Private evidence",
    attachments: "Attachments",
    noEvidence: "No evidence attached.",
    evidenceFile: "Evidence file",
    bytes: "bytes",
    download: "Download",
    supportCategory: "Support",
  },
  ar: {
    supportCase: "\u062d\u0627\u0644\u0629 \u062f\u0639\u0645",
    backToComplaints:
      "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0643\u0627\u0648\u0649",
    caseDescription: "\u0648\u0635\u0641 \u0627\u0644\u062d\u0627\u0644\u0629",
    resolution: "\u0627\u0644\u062d\u0644",
    privateEvidence:
      "\u0627\u0644\u0623\u062f\u0644\u0629 \u0627\u0644\u062e\u0627\u0635\u0629",
    attachments: "\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062a",
    noEvidence:
      "\u0644\u0645 \u064a\u062a\u0645 \u0625\u0631\u0641\u0627\u0642 \u0623\u062f\u0644\u0629.",
    evidenceFile: "\u0645\u0644\u0641 \u0625\u062b\u0628\u0627\u062a",
    bytes: "\u0628\u0627\u064a\u062a",
    download: "\u062a\u0646\u0632\u064a\u0644",
    supportCategory: "\u062f\u0639\u0645",
  },
};

const orderMessages: Record<Locale, Record<string, string>> = {
  en: {
    orderDetail: "Order detail",
    order: "Order",
    backToQueue: "Back to queue",
    invoice: "Invoice",
    orderSummary: "Order summary",
    subtotal: "Subtotal",
    deliveryFee: "Delivery fee",
    total: "Total",
    payment: "Payment",
    timeline: "Timeline",
    deliveryProgress: "Delivery progress",
    noDeliveryEvents: "No delivery events recorded yet.",
  },
  ar: {
    orderDetail:
      "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0637\u0644\u0628",
    order: "\u0627\u0644\u0637\u0644\u0628",
    backToQueue:
      "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    invoice: "\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629",
    orderSummary: "\u0645\u0644\u062e\u0635 \u0627\u0644\u0637\u0644\u0628",
    subtotal:
      "\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a",
    deliveryFee:
      "\u0631\u0633\u0648\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    total: "\u0627\u0644\u0645\u062c\u0645\u0648\u0639",
    payment: "\u0627\u0644\u062f\u0641\u0639",
    timeline: "\u0627\u0644\u062e\u0637 \u0627\u0644\u0632\u0645\u0646\u064a",
    deliveryProgress:
      "\u062a\u0642\u062f\u0645 \u0627\u0644\u062a\u0648\u0635\u064a\u0644",
    noDeliveryEvents:
      "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0623\u062d\u062f\u0627\u062b \u0644\u0644\u062a\u0648\u0635\u064a\u0644 \u0628\u0639\u062f.",
  },
};

export function translate(key: string, locale: string): string {
  const selected = locale === "ar" ? "ar" : "en";
  return (
    messages[selected][key] ??
    extraMessages[selected][key] ??
    catalogFieldMessages[selected][key] ??
    adminMessages[selected][key] ??
    healthMessages[selected][key] ??
    dashboardMessages[selected][key] ??
    deliveryMessages[selected][key] ??
    procurementMessages[selected][key] ??
    supportMessages[selected][key] ??
    orderMessages[selected][key] ??
    messages.en[key] ??
    extraMessages.en[key] ??
    catalogFieldMessages.en[key] ??
    adminMessages.en[key] ??
    healthMessages.en[key] ??
    dashboardMessages.en[key] ??
    deliveryMessages.en[key] ??
    procurementMessages.en[key] ??
    supportMessages.en[key] ??
    orderMessages.en[key] ??
    key
  );
}
