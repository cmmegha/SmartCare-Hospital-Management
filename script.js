// =====================================================
// 1. DATA AND APPLICATION VARIABLES
// =====================================================

let patients = JSON.parse(
    localStorage.getItem("smartcarePatients")
) || [];

let claims = JSON.parse(
    localStorage.getItem("smartcareClaims")
) || [];

let currentUser = null;
let currentPage = "dashboard";

let database = null;

let receptionistScanner = null;
let patientLoginScanner = null;


// =====================================================
// 2. DATABASE FOR DOCUMENT FILES
// =====================================================

// Patient and claim details are stored in localStorage.
// Actual uploaded files are stored in IndexedDB.

const databaseReady = openDocumentDatabase();

function openDocumentDatabase() {

    return new Promise((resolve, reject) => {

        if (!window.indexedDB) {
            reject(new Error("IndexedDB is not supported."));
            return;
        }

        const request = indexedDB.open(
            "SmartCareDocuments",
            1
        );

        request.onupgradeneeded = function(event) {

            const db = event.target.result;

            if (!db.objectStoreNames.contains("documents")) {

                db.createObjectStore("documents", {
                    keyPath: "id"
                });

            }

        };

        request.onsuccess = function(event) {

            database = event.target.result;

            resolve(database);

        };

        request.onerror = function() {

            reject(request.error);

        };

    });

}


function saveData() {

    localStorage.setItem(
        "smartcarePatients",
        JSON.stringify(patients)
    );

    localStorage.setItem(
        "smartcareClaims",
        JSON.stringify(claims)
    );

}


function saveDocument(documentData) {

    return new Promise((resolve, reject) => {

        const transaction = database.transaction(
            ["documents"],
            "readwrite"
        );

        transaction.objectStore("documents").put(documentData);

        transaction.oncomplete = () => resolve();

        transaction.onerror = () => reject(transaction.error);

    });

}


function getDocument(documentId) {

    return new Promise((resolve, reject) => {

        const transaction = database.transaction(
            ["documents"],
            "readonly"
        );

        const request = transaction
            .objectStore("documents")
            .get(documentId);

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => reject(request.error);

    });

}


function getAllDocuments() {

    return new Promise((resolve, reject) => {

        const transaction = database.transaction(
            ["documents"],
            "readonly"
        );

        const request = transaction
            .objectStore("documents")
            .getAll();

        request.onsuccess = () => resolve(request.result || []);

        request.onerror = () => reject(request.error);

    });

}


// =====================================================
// 3. HELPER FUNCTIONS
// =====================================================

function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => {

        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[character];

    });

}


function money(value) {

    return "₹" + Number(value || 0).toLocaleString("en-IN");

}


function makeId(prefix) {

    return prefix + Date.now().toString().slice(-7);

}


function getPatient(patientId) {

    return patients.find(patient =>
        patient.id === patientId
    );

}


function getClaim(claimId) {

    return claims.find(claim =>
        claim.id === claimId
    );

}


function statusClass(status) {

    return String(status || "")
        .toLowerCase()
        .replaceAll(" ", "-");

}


function formatDate(date) {

    return new Date(date).toLocaleString("en-IN");

}


function getCurrentPatient() {

    if (!currentUser || currentUser.role !== "patient") {
        return null;
    }

    return getPatient(currentUser.patientId);

}


function showMessage(elementId, message, isError = false) {

    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = message;

    element.style.color = isError ? "#d64545" : "#21834c";

}


// =====================================================
// 4. LOGIN SYSTEM
// =====================================================

const loginRole = document.getElementById("loginRole");

const loginForm = document.getElementById("loginForm");


loginRole.addEventListener("change", function() {

    const isPatient = this.value === "patient";

    document.getElementById("patientFields")
        .classList.toggle("hidden", !isPatient);

    document.getElementById("staffFields")
        .classList.toggle("hidden", isPatient);

    stopPatientLoginScanner();

    document.getElementById("patientLoginReader").innerHTML = "";

    document.getElementById("patientQRMessage").textContent = "";

    document.getElementById("loginError").textContent = "";

});


loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const role = loginRole.value;

    const error = document.getElementById("loginError");

    error.textContent = "";

    try {

        await databaseReady;

    } catch (databaseError) {

        error.textContent =
            "The document database could not be opened. Please refresh the page.";

        return;

    }


    // RECEPTIONIST LOGIN

    if (role === "receptionist") {

        const username =
            document.getElementById("username").value.trim();

        const password =
            document.getElementById("password").value;

        if (username === "recep" && password === "1234") {

            loginSuccess({
                role: "receptionist",
                name: "Receptionist"
            });

        } else {

            error.textContent =
                "Incorrect receptionist login details.";

        }

    }


    // INSURER LOGIN

    else if (role === "insurer") {

        const username =
            document.getElementById("username").value.trim();

        const password =
            document.getElementById("password").value;

        if (username === "insurer" && password === "1234") {

            loginSuccess({
                role: "insurer",
                name: "Insurance Company"
            });

        } else {

            error.textContent =
                "Incorrect insurer login details.";

        }

    }


    // PATIENT LOGIN USING ID AND PHONE

    else if (role === "patient") {

        const patientId = document
            .getElementById("patientLoginId")
            .value.trim()
            .toUpperCase();

        const phone = document
            .getElementById("patientPhone")
            .value.trim();

        const patient = patients.find(p =>
            p.id.toUpperCase() === patientId &&
            p.phone === phone
        );

        if (patient) {

            stopPatientLoginScanner();

            loginSuccess({
                role: "patient",
                name: patient.name,
                patientId: patient.id
            });

        } else {

            error.textContent =
                "Patient ID or registered phone number is incorrect.";

        }

    }

});


function loginSuccess(user) {

    stopPatientLoginScanner();

    stopReceptionistScanner();

    currentUser = user;

    currentPage = "dashboard";

    document.getElementById("loginPage")
        .classList.add("hidden");

    document.getElementById("appPage")
        .classList.remove("hidden");

    document.getElementById("userName").textContent =
        user.name;

    buildNavigation();

    renderPage();

}


// =====================================================
// 5. LOGOUT
// =====================================================

document.getElementById("logoutBtn")
    .addEventListener("click", function() {

        stopPatientLoginScanner();

        stopReceptionistScanner();

        currentUser = null;

        document.getElementById("appPage")
            .classList.add("hidden");

        document.getElementById("loginPage")
            .classList.remove("hidden");

        loginForm.reset();

        loginRole.dispatchEvent(
            new Event("change")
        );

    });


// =====================================================
// 6. NAVIGATION
// =====================================================

function buildNavigation() {

    const nav = document.getElementById("sidebarNav");

    let items = [];


    if (currentUser.role === "receptionist") {

        items = [
            ["dashboard", "▦ Dashboard"],
            ["register", "＋ Register Patient"],
            ["patients", "♙ Patient Records"],
            ["documents", "▤ Document Upload"],
            ["scanner", "▣ QR Scanner"],
            ["claims", "▧ Manage Claims"]
        ];

    }


    else if (currentUser.role === "insurer") {

        items = [
            ["dashboard", "▦ Dashboard"],
            ["claims", "▧ Review Claims"]
        ];

    }


    else if (currentUser.role === "patient") {

        items = [
            ["dashboard", "▦ My Dashboard"],
            ["myqr", "▣ My QR Code"],
            ["myclaims", "▧ My Claims"]
        ];

    }


    nav.innerHTML = items.map(item => `

        <button
            class="nav-btn ${currentPage === item[0] ? "active" : ""}"
            data-page="${item[0]}"
        >
            ${item[1]}
        </button>

    `).join("");

}


document.getElementById("sidebarNav")
    .addEventListener("click", function(event) {

        const button = event.target.closest("[data-page]");

        if (!button) return;

        stopReceptionistScanner();

        currentPage = button.dataset.page;

        buildNavigation();

        renderPage();

    });


// =====================================================
// 7. PAGE RENDERING
// =====================================================

function renderPage() {

    const main = document.getElementById("mainContent");


    if (!currentUser) return;


    // RECEPTIONIST PAGES

    if (currentUser.role === "receptionist") {

        if (currentPage === "dashboard") {
            main.innerHTML = receptionistDashboard();
        }

        else if (currentPage === "register") {
            main.innerHTML = registrationPage();
        }

        else if (currentPage === "patients") {
            main.innerHTML = patientRecordsPage();
        }

        else if (currentPage === "documents") {
            main.innerHTML = documentPage();
            loadDocuments();
        }

        else if (currentPage === "scanner") {
            main.innerHTML = scannerPage();
            setTimeout(startReceptionistScanner, 300);
        }

        else if (currentPage === "claims") {
            main.innerHTML = hospitalClaimsPage();
        }

    }


    // INSURER PAGES

    else if (currentUser.role === "insurer") {

        if (currentPage === "dashboard") {
            main.innerHTML = insurerDashboard();
        }

        else if (currentPage === "claims") {
            main.innerHTML = insurerClaimsPage();
        }

    }


    // PATIENT PAGES

    else if (currentUser.role === "patient") {

        if (currentPage === "dashboard") {
            main.innerHTML = patientDashboard();
        }

        else if (currentPage === "myqr") {
            main.innerHTML = patientQRPage();
            generatePatientQR();
        }

        else if (currentPage === "myclaims") {
            main.innerHTML = patientClaimsPage();
        }

    }

}


// =====================================================
// 8. RECEPTIONIST DASHBOARD
// =====================================================

function receptionistDashboard() {

    const pending = claims.filter(c =>
        c.status === "Pending" ||
        c.status === "Under Review" ||
        c.status === "Additional Information Required"
    ).length;

    const approved = claims.filter(c =>
        c.status === "Approved"
    ).length;


    return `

        <div class="page-heading">

            <h1>Receptionist Dashboard</h1>

            <p>
                Manage patient registration, documents and insurance claims.
            </p>

        </div>


        <div class="stats-grid">

            <div class="stat-card">
                <p>Total Patients</p>
                <h2>${patients.length}</h2>
                <span>Registered patients</span>
            </div>

            <div class="stat-card">
                <p>Total Claims</p>
                <h2>${claims.length}</h2>
                <span>Claims created</span>
            </div>

            <div class="stat-card">
                <p>Pending Claims</p>
                <h2>${pending}</h2>
                <span>Awaiting review or action</span>
            </div>

            <div class="stat-card">
                <p>Approved Claims</p>
                <h2>${approved}</h2>
                <span>Approved by insurer</span>
            </div>

        </div>


        <div class="panel">

            <h3>Welcome to SmartCare</h3>

            <p class="panel-description">
                Register patients, upload their scanned documents
                and submit insurance claims.
            </p>

            <div class="notice">

                <strong>SmartCare Workflow:</strong>

                Register patient → Generate QR → Upload documents →
                Create claim → Submit to insurer → Track insurer response.

            </div>

        </div>


        <div class="panel">

            <h3>Recent Claims</h3>

            ${claimsTable(
                claims.slice().reverse().slice(0, 5),
                true
            )}

        </div>

    `;

}


// =====================================================
// 9. PATIENT REGISTRATION
// =====================================================

function registrationPage() {

    return `

        <div class="page-heading">

            <h1>Register New Patient</h1>

            <p>
                Create a digital patient record and generate a unique Patient ID.
            </p>

        </div>


        <div class="panel">

            <form id="registrationForm">

                <div class="form-grid">


                    <div class="form-group">

                        <label>Patient Name *</label>

                        <input
                            name="name"
                            required
                            placeholder="Full name"
                        >

                    </div>


                    <div class="form-group">

                        <label>Age *</label>

                        <input
                            name="age"
                            type="number"
                            min="1"
                            max="120"
                            required
                        >

                    </div>


                    <div class="form-group">

                        <label>Gender</label>

                        <select name="gender">

                            <option value="Not specified">
                                Select gender
                            </option>

                            <option>Female</option>
                            <option>Male</option>
                            <option>Other</option>

                        </select>

                    </div>


                    <div class="form-group">

                        <label>Phone Number *</label>

                        <input
                            name="phone"
                            type="tel"
                            required
                            pattern="[0-9]{10}"
                            maxlength="10"
                            placeholder="10-digit phone number"
                        >

                    </div>


                    <div class="form-group">

                        <label>Email</label>

                        <input
                            name="email"
                            type="email"
                            placeholder="Email address"
                        >

                    </div>


                    <div class="form-group">

                        <label>Insurance Company</label>

                        <input
                            name="insurance"
                            placeholder="Insurance provider"
                        >

                    </div>


                    <div class="form-group full">

                        <label>Address</label>

                        <textarea
                            name="address"
                            placeholder="Patient address"
                        ></textarea>

                    </div>


                </div>


                <button
                    class="primary-btn"
                    type="submit"
                >
                    Register Patient
                </button>

            </form>

        </div>


        <div id="registrationResult"></div>

    `;

}


function handlePatientRegistration(form) {

    const data = new FormData(form);

    const patient = {

        id: makeId("SC"),

        name: data.get("name").trim(),

        age: data.get("age"),

        gender: data.get("gender"),

        phone: data.get("phone").trim(),

        email: data.get("email").trim(),

        insurance: data.get("insurance").trim(),

        address: data.get("address").trim(),

        createdAt: new Date().toISOString()

    };


    patients.push(patient);

    saveData();


    document.getElementById("registrationResult").innerHTML = `

        <div class="panel">

            <h3>Patient Registered Successfully!</h3>

            <div class="notice">

                Patient ID:

                <strong>${escapeHTML(patient.id)}</strong>

                <br>

                Give this Patient ID to the patient.

                They can also use their QR card to log in to the demo portal.

            </div>


            <div class="qr-area">

                <h3>Patient QR Code</h3>

                <div id="newPatientQR"></div>

                <p>
                    ${escapeHTML(patient.name)}
                </p>

                <p>
                    Patient ID: ${escapeHTML(patient.id)}
                </p>

                <button
                    class="primary-btn"
                    data-action="print-qr"
                    data-id="${patient.id}"
                >
                    Print QR Card
                </button>

            </div>

        </div>

    `;


    if (window.QRCode) {

        new QRCode(
            document.getElementById("newPatientQR"),
            {
                text: patient.id,
                width: 160,
                height: 160
            }
        );

    } else {

        document.getElementById("newPatientQR").textContent =
            "QR library could not load.";

    }


    form.reset();

}


// =====================================================
// 10. PATIENT RECORDS AND SEARCH
// =====================================================

function patientRecordsPage() {

    return `

        <div class="page-heading">

            <h1>Patient Records</h1>

            <p>
                Search and view registered patient information.
            </p>

        </div>


        <div class="panel">

            <label>
                Search by Patient ID, name or phone number
            </label>

            <input
                id="patientSearch"
                placeholder="Type to search..."
            >

            <div
                id="patientRecordsTable"
                style="margin-top:20px"
            >

                ${patientTable(patients)}

            </div>

        </div>

    `;

}


function patientTable(list) {

    if (!list.length) {

        return `
            <p class="empty-message">
                No patients registered yet.
            </p>
        `;

    }


    return `

        <div class="table-wrapper">

            <table>

                <thead>

                    <tr>
                        <th>Patient ID</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Insurance</th>
                        <th>Action</th>
                    </tr>

                </thead>


                <tbody>

                    ${list.map(p => `

                        <tr>

                            <td>${escapeHTML(p.id)}</td>

                            <td>${escapeHTML(p.name)}</td>

                            <td>${escapeHTML(p.phone)}</td>

                            <td>${escapeHTML(p.insurance || "-")}</td>

                            <td>

                                <button class="small-btn" data-action="patient-details" data-id="${p.id}">View</button>
                                <button class="small-btn" data-action="edit-patient" data-id="${p.id}">Edit</button>

                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        </div>

    `;

}


function showPatientDetails(patientId) {
    const p = getPatient(patientId);
    if (!p) return;

    alert(
        "PATIENT DETAILS\\n\\n" +
        "Patient ID: " + p.id + "\\n" +
        "Name: " + p.name + "\\n" +
        "Age: " + p.age + "\\n" +
        "Gender: " + p.gender + "\\n" +
        "Phone: " + p.phone + "\\n" +
        "Email: " + p.email + "\\n" +
        "Insurance: " + p.insurance + "\\n" +
        "Address: " + p.address
    );
}


function editPatient(patientId) {
    const p = getPatient(patientId);
    if (!p) return;

    const name = prompt("Patient name:", p.name);
    if (name === null) return;

    const age = prompt("Age:", p.age || "");
    if (age === null) return;

    const gender = prompt("Gender:", p.gender || "");
    if (gender === null) return;

    const phone = prompt("Phone number:", p.phone || "");
    if (phone === null) return;

    const email = prompt("Email:", p.email || "");
    if (email === null) return;

    const insurance = prompt("Insurance provider:", p.insurance || "");
    if (insurance === null) return;

    const address = prompt("Address:", p.address || "");
    if (address === null) return;

    if (!name.trim() || !/^\d{10}$/.test(phone.trim())) {
        alert("Please enter a patient name and a valid 10-digit phone number.");
        return;
    }

    Object.assign(p, {
        name: name.trim(),
        age: age.trim(),
        gender: gender.trim(),
        phone: phone.trim(),
        email: email.trim(),
        insurance: insurance.trim(),
        address: address.trim()
    });

    // Keep the displayed patient name in existing claims in sync.
    claims.filter(c => c.patientId === p.id).forEach(c => c.patientName = p.name);

    saveData();

    renderPage();

    alert("Patient record updated successfully.");
}


// =====================================================
// 11. DOCUMENT UPLOAD PAGE
// =====================================================

function documentPage() {

    return `

        <div class="page-heading">

            <h1>Document Management</h1>

            <p>
                Upload and organise patient insurance documents.
            </p>

        </div>


        <div class="notice">

            <strong>Using a physical scanner?</strong>

            <br>

            Scan the paper document using your scanner's software.

            Save it as a PDF or image, then upload that saved file here.

        </div>


        <div class="panel">

            <h3>Upload Patient Documents</h3>


            ${patients.length ? `

                <form id="documentForm">


                    <label>Search and Select Patient *</label>

                    <input
                        type="text"
                        id="documentPatientSearch"
                        placeholder="Type patient name, ID or phone..."
                        autocomplete="off"
                        required
                    >

                    <input
                        type="hidden"
                        name="patientId"
                        id="documentPatientId"
                    >

                    <div
                        id="documentPatientResults"
                        class="picker-results"
                    ></div>

                    <p
                        id="documentSelectedPatient"
                        class="form-help"
                    >
                        No patient selected.
                    </p>


                    <label>Link to Claim (optional)</label>

                    <select name="claimId">

                        <option value="">
                            Not linked to a claim yet
                        </option>

                        ${claims.map(c => `

                            <option value="${c.id}">

                                ${escapeHTML(c.id)}
                                -
                                ${escapeHTML(c.patientName)}

                            </option>

                        `).join("")}

                    </select>


                    <label>Document Type *</label>

                    <select name="documentType" required>

                        <option value="">
                            Select document type
                        </option>

                        <option>Hospital Bill</option>
                        <option>Medical Report</option>
                        <option>Prescription</option>
                        <option>Discharge Summary</option>
                        <option>Insurance Form</option>
                        <option>Other</option>

                    </select>


                    <label>Choose PDF or Image *</label>

                    <input
                        type="file"
                        name="file"
                        accept=".pdf,image/jpeg,image/png"
                        required
                    >

                    <p class="form-help">
                        Accepted formats: PDF, JPG and PNG. Maximum size: 10 MB.
                    </p>


                    <button
                        type="submit"
                        class="primary-btn"
                    >
                        Upload Document
                    </button>


                    <p id="documentMessage"></p>


                </form>

            ` : `

                <p class="empty-message">
                    Register a patient before uploading documents.
                </p>

            `}

        </div>


        <div class="panel">

            <h3>Uploaded Documents</h3>

            <div id="documentList">

                <p class="empty-message">
                    Loading documents...
                </p>

            </div>

        </div>

    `;

}


// =====================================================
// 12. SEARCH PATIENT WHILE UPLOADING DOCUMENTS
// =====================================================

document.addEventListener("input", function(event) {

    if (event.target.id === "documentPatientSearch") {

        const search = event.target.value.trim().toLowerCase();

        const results = document.getElementById("documentPatientResults");

        const hidden = document.getElementById("documentPatientId");

        const selected = document.getElementById("documentSelectedPatient");

        if (!results || !hidden) return;

        hidden.value = "";

        if (selected) {
            selected.textContent = "Choose a patient from the search results.";
        }

        const matches = patients.filter(patient =>

            patient.name.toLowerCase().includes(search) ||

            patient.id.toLowerCase().includes(search) ||

            String(patient.phone || "").includes(search)

        ).slice(0, 8);


        results.innerHTML = search ? (matches.length ? matches.map(patient => `

            <button
                type="button"
                class="picker-option"
                data-action="choose-document-patient"
                data-id="${patient.id}"
            >
                <strong>${escapeHTML(patient.name)}</strong>

                <span>
                    ${escapeHTML(patient.id)} · ${escapeHTML(patient.phone || "")}
                </span>

            </button>

        `).join("") : `

            <p class="form-help">
                No matching patients found.
            </p>

        `) : "";

    }


    if (event.target.id === "claimPatientSearch") {

        const search = event.target.value.trim().toLowerCase();

        const results = document.getElementById("claimPatientResults");

        const hidden = document.getElementById("claimPatientId");

        const selected = document.getElementById("claimSelectedPatient");

        if (!results || !hidden) return;

        hidden.value = "";

        if (selected) {
            selected.textContent = "Choose a patient from the search results.";
        }

        const matches = patients.filter(patient =>

            patient.name.toLowerCase().includes(search) ||

            patient.id.toLowerCase().includes(search) ||

            String(patient.phone || "").includes(search)

        ).slice(0, 8);


        results.innerHTML = search ? (matches.length ? matches.map(patient => `

            <button
                type="button"
                class="picker-option"
                data-action="choose-claim-patient"
                data-id="${patient.id}"
            >
                <strong>${escapeHTML(patient.name)}</strong>

                <span>
                    ${escapeHTML(patient.id)} · ${escapeHTML(patient.phone || "")}
                </span>

            </button>

        `).join("") : `

            <p class="form-help">
                No matching patients found.
            </p>

        `) : "";

    }


    // PATIENT RECORD SEARCH

    if (event.target.id === "patientSearch") {

        const search = event.target.value.toLowerCase();

        const filtered = patients.filter(p =>

            p.id.toLowerCase().includes(search) ||

            p.name.toLowerCase().includes(search) ||

            p.phone.includes(search)

        );


        const container = document.getElementById(
            "patientRecordsTable"
        );

        if (container) {

            container.innerHTML = patientTable(filtered);

        }

    }

});


// =====================================================
// 13. HANDLE DOCUMENT UPLOAD
// =====================================================

async function handleDocumentUpload(form) {

    const formData = new FormData(form);

    const file = formData.get("file");

    const patientId = formData.get("patientId");

    const claimId = formData.get("claimId");


    if (!file || !file.size) {

        alert("Please choose a document.");

        return;

    }


    const allowedTypes = [

        "application/pdf",

        "image/jpeg",

        "image/png"

    ];


    if (!allowedTypes.includes(file.type)) {

        alert("Please upload a PDF, JPG or PNG file.");

        return;

    }


    if (file.size > 10 * 1024 * 1024) {

        alert("File must be smaller than 10 MB.");

        return;

    }


    if (!getPatient(patientId)) {

        alert("Please select a valid patient.");

        return;

    }


    if (claimId) {

        const claim = getClaim(claimId);

        if (!claim || claim.patientId !== patientId) {

            alert("Please select a claim belonging to this patient.");

            return;

        }

    }


    const documentData = {

        id: makeId("DOC"),

        patientId: patientId,

        claimId: claimId,

        documentType: formData.get("documentType"),

        fileName: file.name,

        fileType: file.type,

        file: file,

        uploadedAt: new Date().toISOString()

    };


    try {

        await saveDocument(documentData);

        showMessage(
            "documentMessage",
            "Document uploaded successfully!"
        );

        form.reset();

        await loadDocuments();

    } catch (error) {

        console.error(error);

        alert(
            "Could not save document. Please check browser storage and try again."
        );

    }

}


// =====================================================
// 14. DISPLAY UPLOADED DOCUMENTS
// =====================================================

async function loadDocuments() {

    const container = document.getElementById("documentList");

    if (!container) return;


    try {

        const docs = await getAllDocuments();


        if (!docs.length) {

            container.innerHTML = `

                <p class="empty-message">
                    No documents uploaded yet.
                </p>

            `;

            return;

        }


        container.innerHTML = docs
            .slice()
            .reverse()
            .map(doc => {

                const patient = getPatient(doc.patientId);

                return `

                    <div class="document-item">

                        <strong>
                            ${escapeHTML(doc.documentType)}
                        </strong>

                        <p>
                            File: ${escapeHTML(doc.fileName)}
                        </p>

                        <p>
                            Patient:
                            ${escapeHTML(patient?.name || doc.patientId)}
                        </p>

                        <p>
                            Claim:
                            ${escapeHTML(doc.claimId || "Not linked")}
                        </p>

                        <div class="inline-actions">

                            <button
                                class="small-btn"
                                data-action="open-document"
                                data-id="${doc.id}"
                            >
                                View / Open
                            </button>

                            <button
                                class="small-btn"
                                data-action="edit-document"
                                data-id="${doc.id}"
                            >
                                Edit
                            </button>

                            <button
                                class="danger-btn"
                                data-action="delete-document"
                                data-id="${doc.id}"
                            >
                                Delete
                            </button>

                        </div>

                    </div>

                `;

            }).join("");


    } catch (error) {

        container.innerHTML = `

            <p class="empty-message">
                Could not load documents.
            </p>

        `;

    }

}


async function deleteDocument(documentId) {

    if (!confirm("Delete this uploaded document? This cannot be undone.")) {
        return;
    }


    await new Promise((resolve, reject) => {

        const transaction = database.transaction(
            ["documents"],
            "readwrite"
        );

        transaction.objectStore("documents").delete(documentId);

        transaction.oncomplete = resolve;

        transaction.onerror = () => reject(transaction.error);

    });


    await loadDocuments();

    alert("Document deleted.");

}


async function editDocument(documentId) {

    const doc = await getDocument(documentId);

    if (!doc) return;


    const newName = prompt(
        "Edit document file name:",
        doc.fileName
    );

    if (newName === null) return;


    const newType = prompt(

        "Document category (Hospital Bill, Medical Report, Prescription, Discharge Summary, Insurance Form, Other):",

        doc.documentType

    );

    if (newType === null) return;


    if (!newName.trim() || !newType.trim()) {

        alert("Document name and category cannot be empty.");

        return;

    }


    doc.fileName = newName.trim();

    doc.documentType = newType.trim();

    doc.updatedAt = new Date().toISOString();


    await saveDocument(doc);

    await loadDocuments();

    alert("Document details updated.");

}


async function openDocument(documentId) {

    const doc = await getDocument(documentId);

    if (!doc) {

        alert("Document not found.");

        return;

    }


    const url = URL.createObjectURL(doc.file);

    const newWindow = window.open(url, "_blank");


    if (!newWindow) {

        alert("Please allow pop-ups to open the document.");

    }


    setTimeout(() => {

        URL.revokeObjectURL(url);

    }, 60000);

}


// =====================================================
// 15. PRINT PATIENT QR CARD
// =====================================================

function printPatientQR(patientId) {

    const patient = getPatient(patientId);

    if (!patient) return;


    const printWindow = window.open("", "_blank");


    if (!printWindow) {

        alert("Please allow pop-ups to print the QR card.");

        return;

    }


    printWindow.document.write(`

        <!DOCTYPE html>

        <html>

        <head>

            <title>SmartCare Patient QR Card</title>

            <style>

                body {
                    font-family: Arial;
                    text-align: center;
                    padding: 35px;
                }

                .card {
                    border: 2px solid #087f83;
                    border-radius: 15px;
                    padding: 25px;
                    max-width: 350px;
                    margin: auto;
                }

                h2 {
                    color: #087f83;
                }

                img {
                    margin: 20px auto;
                }

            </style>

        </head>


        <body>

            <div class="card">

                <h2>SmartCare</h2>

                <p>Patient Identification Card</p>

                <h3>${escapeHTML(patient.name)}</h3>

                <p>
                    Patient ID: ${escapeHTML(patient.id)}
                </p>

                <div id="printQR"></div>

                <p>
                    Scan this QR code to access the demo patient portal.
                </p>

            </div>


            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>

            <script>

                new QRCode(
                    document.getElementById("printQR"),
                    {
                        text: "${patient.id}",
                        width: 170,
                        height: 170
                    }
                );

                setTimeout(() => window.print(), 800);

            <\/script>

        </body>

        </html>

    `);


    printWindow.document.close();

}


// =====================================================
// 16. RECEPTIONIST QR SCANNER
// =====================================================

function scannerPage() {

    return `

        <div class="page-heading">

            <h1>Patient QR Scanner</h1>

            <p>
                Scan a patient's QR code to quickly find their record.
            </p>

        </div>


        <div class="panel scanner-box">

            <h3>Scan Patient QR Code</h3>

            <p class="panel-description">

                Allow camera access when your browser asks for permission.

            </p>


            <div id="reader"></div>


            <div class="notice">

                You can also search for a patient manually using
                the Patient Records page.

            </div>


            <div id="scanResult"></div>


            <button
                class="secondary-btn"
                data-action="stop-receptionist-scanner"
            >
                Stop Scanner
            </button>

        </div>

    `;

}


async function startReceptionistScanner() {

    const reader = document.getElementById("reader");

    if (!reader || !window.Html5Qrcode) return;


    if (receptionistScanner) return;


    receptionistScanner = new Html5Qrcode("reader");


    try {

        await receptionistScanner.start(

            { facingMode: "environment" },

            {
                fps: 10,
                qrbox: {
                    width: 220,
                    height: 220
                }
            },


            function(decodedText) {

                const patient = getPatient(decodedText.trim());

                const result = document.getElementById("scanResult");

                if (!result) return;


                if (patient) {

                    result.innerHTML = `

                        <div class="notice">

                            <strong>Patient Found!</strong>

                            <br>

                            Name: ${escapeHTML(patient.name)}

                            <br>

                            Patient ID: ${escapeHTML(patient.id)}

                            <br>

                            Phone: ${escapeHTML(patient.phone)}

                        </div>

                    `;

                } else {

                    result.innerHTML = `

                        <div class="notice">

                            No patient found for this QR code.

                        </div>

                    `;

                }


                stopReceptionistScanner();

            }

        );


    } catch (error) {

        const result = document.getElementById("scanResult");

        if (result) {

            result.innerHTML = `

                <p class="error-message">

                    Camera could not start. Check camera permission
                    and use Live Server.

                </p>

            `;

        }

        receptionistScanner = null;

    }

}


async function stopReceptionistScanner() {

    if (!receptionistScanner) return;


    const oldScanner = receptionistScanner;

    receptionistScanner = null;


    try {

        await oldScanner.stop();

        await oldScanner.clear();

    } catch (error) {

        console.log("Receptionist scanner stopped.");

    }

}


// =====================================================
// 17. CREATE CLAIM PAGE
// =====================================================

function hospitalClaimsPage() {

    return `

        <div class="page-heading">

            <h1>Insurance Claims</h1>

            <p>
                Create and submit patient claims to the insurance company.
            </p>

        </div>


        <div class="panel">

            <h3>Create New Claim</h3>


            ${patients.length ? `

                <form id="claimForm">


                    <label>Search and Select Patient *</label>

                    <input
                        type="text"
                        id="claimPatientSearch"
                        placeholder="Search by patient name, ID or phone..."
                        autocomplete="off"
                        required
                    >

                    <input
                        type="hidden"
                        name="patientId"
                        id="claimPatientId"
                    >

                    <div
                        id="claimPatientResults"
                        class="picker-results"
                    ></div>

                    <p
                        id="claimSelectedPatient"
                        class="form-help"
                    >
                        No patient selected.
                    </p>


                    <label>Claim Settlement Type *</label>

                    <select name="claimType" required>

                        <option value="">
                            Select claim type
                        </option>

                        <option value="Cashless">
                            Cashless
                        </option>

                        <option value="Reimbursement">
                            Reimbursement
                        </option>

                    </select>


                    <label>Insurance Type *</label>

                    <select name="insuranceType" required>

                        <option value="">
                            Select insurance type
                        </option>

                        <option>Health Insurance</option>

                        <option>Medical Insurance</option>

                        <option>Personal Accident Insurance</option>

                        <option>Critical Illness Insurance</option>

                        <option>Senior Citizen Health Insurance</option>

                        <option>Family Floater Health Insurance</option>

                        <option>Group Health Insurance</option>

                        <option>Travel Medical Insurance</option>

                        <option>Other</option>

                    </select>


                    <label>Claim Amount (₹) *</label>

                    <input
                        type="number"
                        name="amount"
                        min="1"
                        step="0.01"
                        required
                        placeholder="Enter amount"
                    >


                    <label>Claim Description *</label>

                    <textarea
                        name="description"
                        required
                        placeholder="Briefly describe the claim"
                    ></textarea>


                    <div class="claim-upload-section">

                        <h3>Upload Supporting Documents</h3>

                        <p class="form-help">
                            Attach bills, prescriptions, medical reports,
                            discharge summaries or insurance forms to this claim.
                            You can select multiple files.
                        </p>


                        <label>Document Category</label>

                        <select name="documentType">

                            <option value="">
                                Select document category
                            </option>

                            <option>Hospital Bill</option>

                            <option>Medical Report</option>

                            <option>Prescription</option>

                            <option>Discharge Summary</option>

                            <option>Insurance Form</option>

                            <option>Other</option>

                        </select>


                        <label>Choose PDF or Images</label>

                        <input
                            type="file"
                            name="claimFiles"
                            accept=".pdf,image/jpeg,image/png"
                            multiple
                        >

                        <p class="form-help">
                            Accepted: PDF, JPG and PNG. Maximum 10 MB per file.
                            You can also submit without a file and add documents later.
                        </p>

                    </div>


                    <button
                        class="primary-btn"
                        type="submit"
                    >
                        Submit Claim to Insurer
                    </button>


                </form>

            ` : `

                <p class="empty-message">

                    Register a patient before creating a claim.

                </p>

            `}

        </div>


        <div class="panel">

            <h3>All Claims and Insurer Responses</h3>

            ${claimsTable(claims, true)}

        </div>

    `;

}


// =====================================================
// 18. CREATE AND SUBMIT CLAIM
// =====================================================

async function handleClaimCreation(form) {

    const data = new FormData(form);

    const patient = getPatient(data.get("patientId"));

    if (!patient) {

        alert("Please select a valid patient.");

        return;

    }


    const amount = Number(data.get("amount"));

    if (!Number.isFinite(amount) || amount <= 0) {

        alert("Please enter a valid claim amount.");

        return;

    }


    const claim = {

        id: makeId("CL"),

        patientId: patient.id,

        patientName: patient.name,

        claimType: data.get("claimType"),

        insuranceType: data.get("insuranceType"),

        amount: amount,

        description: data.get("description").trim(),

        status: "Pending",

        createdAt: new Date().toISOString(),

        messages: [

            {

                sender: "Hospital",

                text: "Claim submitted to the insurance company.",

                date: new Date().toISOString(),

                patientVisible: true

            }

        ]

    };


    const files = Array.from(
        form.querySelector('[name="claimFiles"]')?.files || []
    );

    const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ];


    if (files.length && !data.get("documentType")) {

        alert("Please select a document category for the uploaded files.");

        return;

    }


    for (const file of files) {

        if (!allowedTypes.includes(file.type)) {

            alert(`"${file.name}" is not a supported PDF, JPG or PNG file.`);

            return;

        }

        if (file.size > 10 * 1024 * 1024) {

            alert(`"${file.name}" is larger than 10 MB.`);

            return;

        }

    }


    claims.push(claim);


    try {

        for (const file of files) {

            await saveDocument({

                id: makeId("DOC"),

                patientId: patient.id,

                claimId: claim.id,

                documentType: data.get("documentType"),

                fileName: file.name,

                fileType: file.type,

                file: file,

                uploadedAt: new Date().toISOString()

            });

        }


        saveData();


        alert(
            `Claim submitted successfully${files.length ? ` with ${files.length} document(s)` : ""}!`
        );


        renderPage();


    } catch (error) {

        claims = claims.filter(item => item.id !== claim.id);

        saveData();

        console.error(error);

        alert("The claim could not be saved with its documents. Please try again.");

    }

}


// =====================================================
// 19. CLAIMS TABLE
// =====================================================

function claimsTable(list, showAction) {

    if (!list.length) {

        return `

            <p class="empty-message">
                No claims available.
            </p>

        `;

    }


    return `

        <div class="table-wrapper">

            <table>

                <thead>

                    <tr>

                        <th>Claim ID</th>

                        <th>Patient</th>

                        <th>Insurance Type</th>

                        <th>Amount</th>

                        <th>Status</th>

                        ${showAction ? "<th>Action</th>" : ""}

                    </tr>

                </thead>


                <tbody>

                    ${list.slice().reverse().map(c => `

                        <tr>

                            <td>${escapeHTML(c.id)}</td>

                            <td>${escapeHTML(c.patientName)}</td>

                            <td>${escapeHTML(c.insuranceType || "Not specified")}</td>

                            <td>${money(c.amount)}</td>

                            <td>

                                <span class="status ${statusClass(c.status)}">

                                    ${escapeHTML(c.status)}

                                </span>

                            </td>


                            ${showAction ? `

                                <td>

                                    <button

                                        class="small-btn"

                                        data-action="view-claim"

                                        data-id="${c.id}"

                                    >

                                        View

                                    </button>

                                </td>

                            ` : ""}

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        </div>

    `;

}


// =====================================================
// 20. CLAIM DETAILS FOR HOSPITAL
// =====================================================

async function showHospitalClaim(claimId) {

    const claim = getClaim(claimId);

    if (!claim) return;


    const docs = await getAllDocuments();


    const relatedDocs = docs.filter(doc =>

        doc.claimId === claimId ||

        (
            doc.patientId === claim.patientId &&
            !doc.claimId
        )

    );


    const messages = claim.messages || [];


    document.getElementById("mainContent").innerHTML = `

        <div class="page-heading">

            <h1>Claim Details</h1>

            <p>${escapeHTML(claim.id)}</p>

        </div>


        <div class="panel">

            <h3>Claim Information</h3>

            <p>
                Patient:
                <strong>${escapeHTML(claim.patientName)}</strong>
            </p>

            <p>
                Patient ID: ${escapeHTML(claim.patientId)}
            </p>

            <p>
                Claim Type:
                <strong>${escapeHTML(claim.claimType || "Not specified")}</strong>
            </p>

            <p>
                Insurance Type:
                <strong>${escapeHTML(claim.insuranceType || "Not specified")}</strong>
            </p>

            <p>
                Claim Amount:
                <strong>${money(claim.amount)}</strong>
            </p>

            <p>
                Description: ${escapeHTML(claim.description)}
            </p>

            <p style="margin-top:10px">

                Status:

                <span class="status ${statusClass(claim.status)}">

                    ${escapeHTML(claim.status)}

                </span>

            </p>

        </div>


        <div class="panel">

            <h3>Attached Documents</h3>


            ${relatedDocs.length ? relatedDocs.map(doc => `

                <div class="document-item">

                    <strong>${escapeHTML(doc.documentType)}</strong>

                    <p>${escapeHTML(doc.fileName)}</p>

                    <button

                        class="small-btn"

                        data-action="open-document"

                        data-id="${doc.id}"

                    >

                        View Document

                    </button>

                </div>

            `).join("") : `

                <p class="empty-message">

                    No documents attached to this claim yet.

                </p>

            `}

        </div>


        <div class="panel">

            <h3>Claim Communication</h3>


            ${messages.length ? messages.map(message => `

                <div class="message-item">

                    <strong>${escapeHTML(message.sender)}</strong>

                    <p class="message-text">
                        ${escapeHTML(message.text)}
                    </p>

                    <p>${formatDate(message.date)}</p>

                </div>

            `).join("") : `

                <p class="empty-message">
                    No messages yet.
                </p>

            `}


            <form id="hospitalMessageForm" data-claim-id="${claim.id}">

                <label>Send a message to the insurer</label>

                <textarea
                    name="message"
                    required
                    placeholder="Example: The requested discharge summary has been uploaded."
                ></textarea>

                <button
                    class="primary-btn"
                    type="submit"
                >
                    Send Message
                </button>

            </form>

        </div>


        <button
            class="secondary-btn"
            data-action="back-to-claims"
        >
            Back to Claims
        </button>

    `;

}


// =====================================================
// 21. INSURER DASHBOARD
// =====================================================

function insurerDashboard() {

    const pending = claims.filter(c =>
        c.status === "Pending" ||
        c.status === "Under Review"
    ).length;


    return `

        <div class="page-heading">

            <h1>Insurance Company Dashboard</h1>

            <p>
                Review hospital-submitted claims and manage claim decisions.
            </p>

        </div>


        <div class="stats-grid">

            <div class="stat-card">

                <p>Total Claims Received</p>

                <h2>${claims.length}</h2>

                <span>Submitted by hospital</span>

            </div>


            <div class="stat-card">

                <p>Pending / Under Review</p>

                <h2>${pending}</h2>

                <span>Awaiting review</span>

            </div>


            <div class="stat-card">

                <p>Approved</p>

                <h2>
                    ${claims.filter(c => c.status === "Approved").length}
                </h2>

                <span>Approved claims</span>

            </div>


            <div class="stat-card">

                <p>Rejected</p>

                <h2>
                    ${claims.filter(c => c.status === "Rejected").length}
                </h2>

                <span>Rejected claims</span>

            </div>

        </div>


        <div class="panel">

            <h3>Recently Submitted Claims</h3>

            ${claimsTable(
                claims.slice().reverse().slice(0, 5),
                true
            )}

        </div>

    `;

}


// =====================================================
// 22. INSURER CLAIMS PAGE
// =====================================================

function insurerClaimsPage() {

    return `

        <div class="page-heading">

            <h1>Review Insurance Claims</h1>

            <p>
                Check submitted documents and update claim decisions.
            </p>

        </div>


        <div class="panel">

            <h3>Claims Submitted by Hospital</h3>

            ${claimsTable(claims, true)}

        </div>

    `;

}


// =====================================================
// 23. INSURER CLAIM REVIEW
// =====================================================

async function showInsurerClaim(claimId) {

    const claim = getClaim(claimId);

    if (!claim) return;


    const docs = await getAllDocuments();


    const relatedDocs = docs.filter(doc =>

        doc.claimId === claimId ||

        (
            doc.patientId === claim.patientId &&
            !doc.claimId
        )

    );


    const messages = claim.messages || [];


    document.getElementById("mainContent").innerHTML = `

        <div class="page-heading">

            <h1>Insurer Claim Review</h1>

            <p>
                Claim ID: ${escapeHTML(claim.id)}
            </p>

        </div>


        <div class="panel">

            <h3>Submitted Claim Details</h3>


            <p>
                Patient:
                <strong>${escapeHTML(claim.patientName)}</strong>
            </p>


            <p>
                Patient ID: ${escapeHTML(claim.patientId)}
            </p>


            <p>
                Claim Type:
                <strong>${escapeHTML(claim.claimType || "Not specified")}</strong>
            </p>

            <p>
                Insurance Type:
                <strong>${escapeHTML(claim.insuranceType || "Not specified")}</strong>
            </p>


            <p>
                Claim Amount:
                <strong>${money(claim.amount)}</strong>
            </p>


            <p>
                Description: ${escapeHTML(claim.description)}
            </p>


            <p style="margin-top:10px">

                Current Status:

                <span class="status ${statusClass(claim.status)}">

                    ${escapeHTML(claim.status)}

                </span>

            </p>

        </div>


        <div class="panel">

            <h3>Patient Documents</h3>


            ${relatedDocs.length ? relatedDocs.map(doc => `

                <div class="document-item">

                    <strong>${escapeHTML(doc.documentType)}</strong>

                    <p>${escapeHTML(doc.fileName)}</p>

                    <button

                        class="small-btn"

                        data-action="open-document"

                        data-id="${doc.id}"

                    >

                        View Document

                    </button>

                </div>

            `).join("") : `

                <p class="empty-message">

                    No documents uploaded for this claim.

                </p>

            `}

        </div>


        <div class="panel">

            <h3>Update Claim Decision</h3>


            <form id="insurerDecisionForm" data-claim-id="${claim.id}">


                <label>Claim Status</label>


                <select name="status" required>

                    ${[

                        "Pending",

                        "Under Review",

                        "Approved",

                        "Rejected",

                        "Additional Information Required"

                    ].map(status => `

                        <option

                            value="${status}"

                            ${claim.status === status ? "selected" : ""}

                        >

                            ${status}

                        </option>

                    `).join("")}

                </select>


                <label>Remarks / Message to Hospital</label>


                <textarea

                    name="remarks"

                    placeholder="Optional: Explain the decision or request additional documents."

                ></textarea>


                <p class="form-help">

                    Remarks are optional. You can approve or reject a claim
                    without entering a message.

                </p>


                <label>

                    <input

                        type="checkbox"

                        name="patientVisible"

                        style="width:auto; margin-right:7px"

                    >

                    Make this update visible to the patient

                </label>


                <button

                    class="primary-btn"

                    type="submit"

                >

                    Save Decision

                </button>


            </form>

        </div>


        <div class="panel">

            <h3>Claim Communication History</h3>


            ${messages.length ? messages.map(message => `

                <div class="message-item">

                    <strong>${escapeHTML(message.sender)}</strong>

                    <p class="message-text">
                        ${escapeHTML(message.text)}
                    </p>

                    <p>${formatDate(message.date)}</p>

                    <p>
                        Patient visible:
                        ${message.patientVisible ? "Yes" : "No"}
                    </p>

                </div>

            `).join("") : `

                <p class="empty-message">
                    No communication yet.
                </p>

            `}

        </div>


        <button

            class="secondary-btn"

            data-action="back-to-claims"

        >

            Back to Claims

        </button>

    `;

}


// =====================================================
// 24. PATIENT DASHBOARD
// =====================================================

function patientDashboard() {

    const patient = getCurrentPatient();

    if (!patient) {

        return "<p>Patient record not found.</p>";

    }


    const ownClaims = claims.filter(c =>
        c.patientId === patient.id
    );


    const approved = ownClaims.filter(c =>
        c.status === "Approved"
    ).length;


    const pending = ownClaims.filter(c =>

        c.status === "Pending" ||

        c.status === "Under Review" ||

        c.status === "Additional Information Required"

    ).length;


    return `

        <div class="page-heading">

            <h1>
                Welcome, ${escapeHTML(patient.name)}
            </h1>

            <p>
                View your patient information and insurance claim updates.
            </p>

        </div>


        <div class="stats-grid">


            <div class="stat-card">

                <p>Patient ID</p>

                <h2 style="font-size:19px">
                    ${escapeHTML(patient.id)}
                </h2>

                <span>Your SmartCare ID</span>

            </div>


            <div class="stat-card">

                <p>Total Claims</p>

                <h2>${ownClaims.length}</h2>

                <span>Your submitted claims</span>

            </div>


            <div class="stat-card">

                <p>Approved Claims</p>

                <h2>${approved}</h2>

                <span>Approved by insurer</span>

            </div>


            <div class="stat-card">

                <p>Pending Claims</p>

                <h2>${pending}</h2>

                <span>Awaiting review or action</span>

            </div>


        </div>


        <div class="panel">

            <h3>My Patient Information</h3>

            <p>
                Name: ${escapeHTML(patient.name)}
            </p>

            <p>
                Phone: ${escapeHTML(patient.phone)}
            </p>

            <p>
                Insurance: ${escapeHTML(patient.insurance || "Not provided")}
            </p>

        </div>


        <div class="panel">

            <h3>My Recent Claims</h3>

            ${claimsTable(ownClaims, false)}

        </div>

    `;

}


// =====================================================
// 25. PATIENT QR CODE PAGE
// =====================================================

function patientQRPage() {

    const patient = getCurrentPatient();

    if (!patient) return "<p>Patient not found.</p>";


    return `

        <div class="page-heading">

            <h1>My Patient QR Code</h1>

            <p>
                Your QR code helps hospital staff identify your digital record.
            </p>

        </div>


        <div class="panel">

            <div class="qr-area">

                <h3>SmartCare Patient Identification</h3>

                <div id="patientQR"></div>

                <p>
                    <strong>${escapeHTML(patient.name)}</strong>
                </p>

                <p>
                    Patient ID: ${escapeHTML(patient.id)}
                </p>


                <button

                    class="primary-btn"

                    data-action="print-qr"

                    data-id="${patient.id}"

                >

                    Print QR Card

                </button>

            </div>

        </div>

    `;

}


function generatePatientQR() {

    const patient = getCurrentPatient();

    const container = document.getElementById("patientQR");

    if (!patient || !container) return;


    if (!window.QRCode) {

        container.textContent = "QR library could not load.";

        return;

    }


    new QRCode(container, {

        text: patient.id,

        width: 180,

        height: 180

    });

}


// =====================================================
// 26. PATIENT CLAIM TRACKING
// =====================================================

function patientClaimsPage() {

    const patient = getCurrentPatient();

    if (!patient) return "<p>Patient not found.</p>";


    const ownClaims = claims.filter(c =>
        c.patientId === patient.id
    );


    return `

        <div class="page-heading">

            <h1>My Insurance Claims</h1>

            <p>
                Track the progress of your insurance claims.
            </p>

        </div>


        ${ownClaims.length ? ownClaims.slice().reverse().map(claim => `

            <div class="panel">

                <h3>${escapeHTML(claim.id)}</h3>


                <p>
                    Claim Type:
                    <strong>${escapeHTML(claim.claimType || "Not specified")}</strong>
                </p>

                <p>
                    Insurance Type:
                    <strong>${escapeHTML(claim.insuranceType || "Not specified")}</strong>
                </p>


                <p>
                    Claim Amount:
                    <strong>${money(claim.amount)}</strong>
                </p>


                <p style="margin-top:10px">

                    Description:
                    ${escapeHTML(claim.description)}

                </p>


                <p style="margin-top:12px">

                    Current Status:

                    <span class="status ${statusClass(claim.status)}">

                        ${escapeHTML(claim.status)}

                    </span>

                </p>


                <div style="margin-top:18px">

                    <strong>Patient Updates</strong>


                    ${(claim.messages || []).filter(m =>
                        m.patientVisible
                    ).length ?


                        (claim.messages || [])
                            .filter(m => m.patientVisible)
                            .map(m => `

                                <div class="message-item">

                                    <strong>
                                        ${escapeHTML(m.sender)}
                                    </strong>

                                    <p class="message-text">
                                        ${escapeHTML(m.text)}
                                    </p>

                                    <p>${formatDate(m.date)}</p>

                                </div>

                            `).join("")


                        : `

                            <p class="empty-message">
                                No patient-facing updates yet.
                            </p>

                        `

                    }

                </div>

            </div>

        `).join("") : `

            <div class="panel">

                <p class="empty-message">

                    You do not have any insurance claims yet.

                </p>

            </div>

        `}

    `;

}


// =====================================================
// 27. PATIENT QR LOGIN SCANNER
// =====================================================

document.getElementById("startPatientQR")
    .addEventListener("click", async function() {

        const message = document.getElementById(
            "patientQRMessage"
        );

        const reader = document.getElementById(
            "patientLoginReader"
        );


        message.textContent = "";

        reader.innerHTML = "";


        if (!window.Html5Qrcode) {

            message.textContent =
                "QR scanner library could not load. Check your internet connection.";

            return;

        }


        if (patientLoginScanner) {

            return;

        }


        patientLoginScanner = new Html5Qrcode(
            "patientLoginReader"
        );


        try {

            await patientLoginScanner.start(

                { facingMode: "environment" },

                {

                    fps: 10,

                    qrbox: {
                        width: 220,
                        height: 220
                    }

                },


                async function(decodedText) {

                    const patientId = decodedText
                        .trim()
                        .toUpperCase();


                    const patient = patients.find(p =>

                        p.id.toUpperCase() === patientId

                    );


                    if (!patient) {

                        message.textContent =
                            "No patient record found for this QR code.";

                        return;

                    }


                    await stopPatientLoginScanner();


                    document.getElementById("patientLoginId").value =
                        patient.id;


                    // DEMONSTRATION LOGIN:
                    // The QR code identifies the patient.
                    // Real deployments need additional verification.

                    loginSuccess({

                        role: "patient",

                        name: patient.name,

                        patientId: patient.id

                    });

                }

            );


        } catch (error) {

            console.error(error);

            patientLoginScanner = null;

            message.textContent =
                "Camera could not start. Allow camera permission and use Live Server.";

        }

    });


async function stopPatientLoginScanner() {

    if (!patientLoginScanner) return;


    const oldScanner = patientLoginScanner;

    patientLoginScanner = null;


    try {

        await oldScanner.stop();

        await oldScanner.clear();

    } catch (error) {

        console.log("Patient login scanner stopped.");

    }

}


// =====================================================
// 28. ALL FORM SUBMISSIONS
// =====================================================

document.addEventListener("submit", async function(event) {

    const form = event.target;


    // PATIENT REGISTRATION

    if (form.id === "registrationForm") {

        event.preventDefault();

        handlePatientRegistration(form);

    }


    // DOCUMENT UPLOAD

    else if (form.id === "documentForm") {

        event.preventDefault();

        await handleDocumentUpload(form);

    }


    // CLAIM CREATION

    else if (form.id === "claimForm") {

        event.preventDefault();

        await handleClaimCreation(form);

    }


    // HOSPITAL MESSAGE

    else if (form.id === "hospitalMessageForm") {

        event.preventDefault();

        const claimId = form.dataset.claimId;

        const claim = getClaim(claimId);

        if (!claim) return;


        const message = new FormData(form)
            .get("message")
            .trim();


        if (!message) return;


        claim.messages = claim.messages || [];


        claim.messages.push({

            sender: "Hospital",

            text: message,

            date: new Date().toISOString(),

            patientVisible: true

        });


        saveData();

        await showHospitalClaim(claimId);

    }


    // INSURER DECISION

    else if (form.id === "insurerDecisionForm") {

        event.preventDefault();

        const claimId = form.dataset.claimId;

        const claim = getClaim(claimId);

        if (!claim) return;


        const data = new FormData(form);

        const newStatus = data.get("status");

        const remarks = (data.get("remarks") || "").trim();


        claim.status = newStatus;

        claim.messages = claim.messages || [];


        // REMARKS ARE OPTIONAL.
        // Only add a message when the insurer enters one.

        if (remarks !== "") {

            claim.messages.push({

                sender: "Insurance Company",

                text: remarks,

                date: new Date().toISOString(),

                patientVisible: data.has("patientVisible")

            });

        }


        saveData();


        alert("Claim decision saved successfully.");


        await showInsurerClaim(claimId);

    }

});


// =====================================================
// 29. ALL BUTTON ACTIONS
// =====================================================

document.addEventListener("click", async function(event) {

    const button = event.target.closest("[data-action]");

    if (!button) return;


    const action = button.dataset.action;

    const id = button.dataset.id;


    // VIEW PATIENT

    if (action === "patient-details") {

        showPatientDetails(id);

    }

    else if (action === "edit-patient") {

        editPatient(id);

    }

    else if (action === "choose-document-patient") {

        const patient = getPatient(id);

        const input = document.getElementById("documentPatientSearch");

        const hidden = document.getElementById("documentPatientId");

        const selected = document.getElementById("documentSelectedPatient");

        const results = document.getElementById("documentPatientResults");


        if (patient && input && hidden) {

            input.value = `${patient.name} (${patient.id})`;

            hidden.value = patient.id;

            if (selected) {
                selected.textContent = `Selected: ${patient.name} · ${patient.id}`;
            }

            if (results) {
                results.innerHTML = "";
            }

        }

    }

    else if (action === "choose-claim-patient") {

        const patient = getPatient(id);

        const input = document.getElementById("claimPatientSearch");

        const hidden = document.getElementById("claimPatientId");

        const selected = document.getElementById("claimSelectedPatient");

        const results = document.getElementById("claimPatientResults");


        if (patient && input && hidden) {

            input.value = `${patient.name} (${patient.id})`;

            hidden.value = patient.id;

            if (selected) {
                selected.textContent = `Selected: ${patient.name} · ${patient.id}`;
            }

            if (results) {
                results.innerHTML = "";
            }

        }

    }

    else if (action === "edit-document") {

        await editDocument(id);

    }

    else if (action === "delete-document") {

        await deleteDocument(id);

    }


    // OPEN DOCUMENT

    else if (action === "open-document") {

        await openDocument(id);

    }


    // PRINT QR

    else if (action === "print-qr") {

        printPatientQR(id);

    }


    // VIEW CLAIM

    else if (action === "view-claim") {

        if (currentUser.role === "receptionist") {

            await showHospitalClaim(id);

        }

        else if (currentUser.role === "insurer") {

            await showInsurerClaim(id);

        }

    }


    // RETURN TO CLAIMS

    else if (action === "back-to-claims") {

        currentPage = "claims";

        buildNavigation();

        renderPage();

    }


    // STOP RECEPTIONIST SCANNER

    else if (action === "stop-receptionist-scanner") {

        await stopReceptionistScanner();

    }

});


// =====================================================
// 30. INITIALISE SMARTCARE
// =====================================================

async function initialiseSmartCare() {

    try {

        await databaseReady;

        console.log("SmartCare document database ready.");

    } catch (error) {

        console.error(
            "SmartCare document database error:",
            error
        );

    }

}


initialiseSmartCare();
