
const $jurusanDisplay = document.getElementById("minat_jurusan_display");
const $jurusanList = document.getElementById("programSuggestions");
const $sekolahDisplay = document.getElementById("asal_sekolah_display");
const $sekolahList = document.getElementById("schoolSuggestions");
const $debug = document.getElementById("debug");

function debounce(fn, wait = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

// Fungsi ini sekarang memanggil Vercel Serverless Function
async function runQuery(objectType, searchTerm) {
  const serverlessUrl = `/api/salesforce-query?type=${objectType}&term=${encodeURIComponent(searchTerm)}`;
  
  try {
    const res = await fetch(serverlessUrl);
    if (!res.ok) {
      const errorData = await res.json();
      $debug.textContent = `Error dari server: ${errorData.message || res.statusText}`;
      return [];
    }
    const data = await res.json();
    return data.records || [];
  } catch (error) {
    $debug.textContent = `Error Koneksi ke serverless function: ${error.message}`;
    return [];
  }
}

function renderJurusanList(records) {
    $jurusanList.innerHTML = "";
    if (!records.length) { $jurusanList.hidden = true; return; }
    records.forEach(r => {
        const li = document.createElement("li");
        li.textContent = r.Name;
        li.onclick = () => {
          $jurusanDisplay.value = r.Name;
          $jurusanList.hidden = true;
          $debug.textContent = `Dipilih: Jurusan ${r.Name}`;
        };
        $jurusanList.appendChild(li);
    });
    $jurusanList.hidden = false;
}

function renderSchoolList(records) {
    $sekolahList.innerHTML = "";
    if (!records.length) { $sekolahList.hidden = true; return; }
    records.forEach(r => {
        const li = document.createElement("li");
        li.textContent = `${r.Name} (NPSN: ${r.NPSN__c})`;
        li.onclick = () => {
            $sekolahDisplay.value = r.Name;
            $sekolahList.hidden = true;
            $debug.textContent = `Dipilih: Sekolah ${r.Name}`;
        };
        $sekolahList.appendChild(li);
    });
    $sekolahList.hidden = false;
}

const searchJurusan = debounce(async () => {
    const term = $jurusanDisplay.value.trim();
    if (term.length < 2) { $jurusanList.hidden = true; return; }
    $debug.textContent = "Mencari jurusan…";
    const recs = await runQuery('jurusan', term);
    renderJurusanList(recs);
}, 300);

const searchSekolah = debounce(async () => {
    const term = $sekolahDisplay.value.trim();
    if (term.length < 2) { $sekolahList.hidden = true; return; }
    $debug.textContent = "Mencari sekolah…";
    const recs = await runQuery('sekolah', term);
    renderSchoolList(recs);
}, 300);

// Event Listeners
$jurusanDisplay.addEventListener("input", searchJurusan);
$sekolahDisplay.addEventListener("input", searchSekolah);

document.addEventListener("click", (e) => {
    if (!e.target.closest(".form-group")) {
        $jurusanList.hidden = true;
        $sekolahList.hidden = true;
    }
});