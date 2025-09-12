# Metro Seven University - Landing Page

Landing page modern dan responsif untuk Universitas Metro Seven yang dirancang dengan teknologi web terkini.

## 🎯 Fitur Utama

- **Desain Modern & Responsif**: Tampilan yang menarik dan optimal di semua perangkat
- **Hero Section**: Area utama dengan gambar background dan call-to-action yang menarik
- **Program Studi**: Showcase program unggulan universitas
- **Fasilitas Kampus**: Galeri fasilitas modern yang tersedia
- **Testimoni Alumni**: Carousel testimoni dari alumni sukses
- **Form Kontak**: Form interaktif untuk calon mahasiswa
- **Animasi Smooth**: Efek animasi yang halus dan profesional
- **Optimized Performance**: Website yang cepat dan SEO-friendly

## 🛠️ Teknologi yang Digunakan

- **HTML5**: Struktur semantic dan modern
- **CSS3**: Styling dengan Flexbox, Grid, dan animasi CSS
- **JavaScript (ES6+)**: Interaktivitas dan fungsionalitas dinamis
- **Font Awesome**: Icon set untuk UI yang konsisten
- **Google Fonts**: Typography modern dengan font Inter

## 📁 Struktur Project

```
metro-seven-university/
├── src/
│   ├── index.html              # File HTML utama
│   ├── css/
│   │   ├── main.css           # Style utama website
│   │   └── responsive.css     # Style responsive untuk mobile
│   ├── js/
│   │   ├── main.js           # JavaScript utama
│   │   └── animations.js     # Animasi dan efek visual
│   └── assets/
│       └── images/           # Semua gambar dan aset visual
├── package.json              # Metadata project
└── README.md                # Dokumentasi ini
```

## 🚀 Cara Menjalankan

1. **Clone atau download project**
   ```bash
   git clone [repository-url]
   cd metro-seven-university
   ```

2. **Buka file HTML**
   - Buka `src/index.html` di browser
   - Atau gunakan live server untuk development

3. **Development dengan Live Server**
   ```bash
   # Jika menggunakan VS Code dengan Live Server extension
   # Klik kanan pada index.html > Open with Live Server
   ```

## 📱 Responsivitas

Website ini telah dioptimalkan untuk berbagai ukuran layar:

- **Desktop**: 1200px ke atas
- **Tablet**: 768px - 1199px
- **Mobile**: 320px - 767px

## 🎨 Komponen Utama

### 1. Navigation Bar
- Logo universitas
- Menu navigasi responsive
- Hamburger menu untuk mobile
- Efek scroll yang halus

### 2. Hero Section
- Background image dengan overlay
- Judul dan subtitle yang menarik
- Call-to-action buttons
- Statistik universitas

### 3. About Section
- Visi dan misi universitas
- Foto staff
- Grid layout yang responsif

### 4. Programs Section
- Card-based layout
- Icon untuk setiap program
- Daftar fitur program
- Hover effects

### 5. Facilities Section
- Layout bergantian (left-right)
- Gambar fasilitas berkualitas tinggi
- Deskripsi lengkap

### 6. Services Section
- Layanan mahasiswa
- Card layout dengan gambar
- Informasi bimbingan karir

### 7. Testimonials Section
- Slider/carousel testimoni
- Rating bintang
- Foto dan info alumni
- Navigasi prev/next

### 8. Contact Section
- Form kontak interaktif
- Informasi kontak lengkap
- Validasi form JavaScript
- Icon untuk setiap jenis kontak

### 9. Footer
- Link navigasi
- Social media links
- Logo partner
- Copyright information

## 💡 Fitur JavaScript

### Navigasi Mobile
- Toggle hamburger menu
- Close menu saat klik link
- Smooth scrolling ke section

### Testimonials Slider
- Auto-slide setiap 5 detik
- Manual navigation dengan tombol
- Smooth transition

### Form Validation
- Validasi email format
- Validasi nomor telepon
- Notifikasi sukses/error
- Reset form setelah submit

### Scroll Effects
- Navbar transparan saat scroll
- Scroll to top button
- Parallax effect (desktop only)

### Animations
- Intersection Observer untuk animasi scroll
- Counter animation untuk statistik
- Loading states dan shimmer effects
- Hover effects untuk cards

## 🎯 SEO Optimizations

- Meta tags yang lengkap
- Semantic HTML structure
- Alt text untuk semua gambar
- Structured data ready
- Fast loading time
- Mobile-first design

## 🔧 Kustomisasi

### Mengubah Warna Tema
Edit variabel CSS di `main.css`:
```css
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --accent-color: #FFD700;
}
```

### Menambah Program Studi
Tambahkan card baru di section programs:
```html
<div class="program-card">
    <div class="program-icon">
        <i class="fas fa-icon-name"></i>
    </div>
    <h3>Nama Program</h3>
    <p>Deskripsi program...</p>
</div>
```

### Mengubah Gambar
Ganti file gambar di folder `assets/images/` dan update reference di HTML.

## 📋 Browser Support

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🚀 Performance

- Page load time: < 3 detik
- Lighthouse score: 90+
- Mobile-friendly
- Optimized images
- Minified CSS/JS ready

## 📝 TODO / Future Enhancements

- [ ] Implementasi CMS untuk konten dinamis
- [ ] Integrasi dengan database untuk form kontak
- [ ] Multi-language support
- [ ] Dark mode toggle
- [ ] Progressive Web App (PWA)
- [ ] Google Analytics integration
- [ ] Blog section
- [ ] Online admission system

## 🤝 Contributing

Jika ingin berkontribusi:

1. Fork repository
2. Buat branch fitur (`git checkout -b feature/AmazingFeature`)
3. Commit perubahan (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 📞 Support

Untuk pertanyaan atau bantuan:
- Email: developer@metroseven.ac.id
- Website: https://metroseven.ac.id

## 📄 License

Project ini menggunakan MIT License. Lihat file `LICENSE` untuk detail.

---

**Dibuat dengan ❤️ untuk Metro Seven University**
