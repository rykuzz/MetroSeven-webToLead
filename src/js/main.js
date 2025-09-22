document.addEventListener('DOMContentLoaded', function() {
    
    // Mobile Navigation Toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }));
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70; // Adjusted for navbar height
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Scroll to Top Button
    const scrollToTopBtn = document.getElementById('scrollToTop');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        });
        scrollToTopBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ===== Sambutan Video: autoplay (muted) + tombol Play/Pause + unmute on first click =====
    const video = document.getElementById('sambutanVideo');
    const playPauseBtn = document.getElementById('playPauseBtn');

    if (video) {
        // Pastikan autoplay berjalan (browser modern butuh muted)
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        // Sync label tombol saat siap
        video.addEventListener('play', () => {
            if (playPauseBtn) playPauseBtn.textContent = 'Pause';
        });
        video.addEventListener('pause', () => {
            if (playPauseBtn) playPauseBtn.textContent = 'Play';
        });

        // Unmute setelah interaksi pertama pengguna (kebijakan autoplay)
        const tryUnmute = () => {
            // Hanya unmute jika user memang mau mendengar; lakukan play() agar tidak pause setelah unmute
            video.muted = false;
            video.play().catch(() => {}); // abaikan jika gagal
            document.removeEventListener('click', tryUnmute);
        };
        document.addEventListener('click', tryUnmute, { once: true });

        // Tombol Play/Pause custom (opsional, selain controls native)
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }
    }

    console.log('Metro Seven University website loaded successfully!');
});
