// Ambil semua elemen dari halaman (DOM Elements)
const $jurusanInput = document.getElementById("minat_jurusan_display");
const $jurusanHidden = document.getElementById("minat_jurusan_final");
const $jurusanList = document.getElementById("programSuggestions");

const $sekolahInput = document.getElementById("asal_sekolah_display");
const $sekolahHidden = document.getElementById("asal_sekolah_final");
const $sekolahList = document.getElementById("schoolSuggestions");

const $schoolNotFoundCheckbox = document.getElementById("school_not_found");
const $otherSchoolContainer = document.getElementById("otherSchoolContainer");
const $otherSchoolNPSN = document.getElementById("other_school_npsn");
const $otherSchoolName = document.getElementById("other_school_name");
const $leadDescription = document.getElementById("description");

const $debug = document.getElementById("debug");

// Fungsi untuk menunda eksekusi (untuk efisiensi pencarian)
function debounce(fn, wait = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

// Fungsi utama untuk mengambil data dari Salesforce via Serverless Function
async function runQuery(type, term) {
  try {
    const res = await fetch(`/api/salesforce-query?type=${type}&term=${encodeURIComponent(term)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || res.statusText);
    }
    const data = await res.json();
    return data.records || [];
  } catch (err) {
    $debug.textContent = `Error: ${err.message}`;
    return [];
  }
}

// Fungsi untuk menampilkan daftar suggestion jurusan
function renderJurusanList(records) {
  $jurusanList.innerHTML = "";
  if (!records.length) { $jurusanList.hidden = true; return; }
  records.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r.Name;
    li.onclick = () => {
      $jurusanInput.value = r.Name;
      $jurusanHidden.value = r.Id; // Menyimpan Salesforce ID
      $jurusanList.hidden = true;
      $debug.textContent = `Dipilih: Jurusan ${r.Name} (ID: ${r.Id})`;
    };
    $jurusanList.appendChild(li);
  });
  $jurusanList.hidden = false;
}

// Fungsi untuk menampilkan daftar suggestion sekolah
function renderSchoolList(records) {
  $sekolahList.innerHTML = "";
  if (!records.length) { $sekolahList.hidden = true; return; }
  records.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.Name} (NPSN: ${r.NPSN__c})`;
    li.onclick = () => {
      $sekolahInput.value = r.Name;
      $sekolahHidden.value = r.NPSN__c; // Menyimpan NPSN
      $sekolahList.hidden = true;
      $debug.textContent = `Dipilih: Sekolah ${r.Name} (NPSN: ${r.NPSN__c})`;
      $schoolNotFoundCheckbox.checked = false;
      showManualInput(false);
      updateDescriptionField();
    };
    $sekolahList.appendChild(li);
  });
  $sekolahList.hidden = false;
}

// Fungsi untuk menampilkan/menyembunyikan input manual
function showManualInput(show) {
  if (show) {
    $otherSchoolContainer.style.display = 'block';
    $otherSchoolNPSN.required = true;
    $otherSchoolName.required = true;
    $sekolahInput.required = false;
    $sekolahInput.disabled = true;
    $sekolahInput.value = "";
    $sekolahHidden.value = "";
    $sekolahList.hidden = true;
  } else {
    $otherSchoolContainer.style.display = 'none';
    $otherSchoolNPSN.required = false;
    $otherSchoolName.required = false;
    $sekolahInput.required = true;
    $sekolahInput.disabled = false;
  }
}

// Fungsi untuk meng-update field description
function updateDescriptionField() {
  const npsn = $otherSchoolNPSN.value.trim();
  const schoolName = $otherSchoolName.value.trim();
  if ($schoolNotFoundCheckbox.checked && npsn && schoolName) {
    $leadDescription.value = `Nama Sekolah (Manual): ${schoolName}, NPSN: ${npsn}`;
  } else {
    $leadDescription.value = "";
  }
}

// Fungsi pencarian
const searchJurusan = debounce(async () => {
  const term = $jurusanInput.value.trim();
  if (term.length < 2) { $jurusanList.hidden = true; return; }
  $debug.textContent = "Mencari jurusan…";
  const recs = await runQuery('jurusan', term);
  renderJurusanList(recs);
}, 300);

const searchSekolah = debounce(async () => {
  const term = $sekolahInput.value.trim();
  if (term.length < 2) { $sekolahList.hidden = true; return; }
  $debug.textContent = "Mencari sekolah…";
  const recs = await runQuery('sekolah', term);
  renderSchoolList(recs);
}, 300);

// Event Listeners
$jurusanInput.addEventListener("input", searchJurusan);
$sekolahInput.addEventListener("input", searchSekolah);

$schoolNotFoundCheckbox.addEventListener('change', (event) => {
    if (event.target.checked) {
        showManualInput(true);
        $debug.textContent = "Mode input sekolah manual diaktifkan.";
    } else {
        showManualInput(false);
        $debug.textContent = "Mode input sekolah manual dinonaktifkan.";
        $otherSchoolNPSN.value = "";
        $otherSchoolName.value = "";
        updateDescriptionField();
    }
});

$otherSchoolNPSN.addEventListener('input', updateDescriptionField);
$otherSchoolName.addEventListener('input', updateDescriptionField);

document.addEventListener("click", e => {
  if (!e.target.closest(".form-group")) {
    $jurusanList.hidden = true;
    $sekolahList.hidden = true;
  }
});
