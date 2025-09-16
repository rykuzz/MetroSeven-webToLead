document.addEventListener('DOMContentLoaded', function() {
    
    const animationStyles = `
        .animate-in {
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .animate-in.is-visible {
            opacity: 1;
            transform: translateY(0);
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = animationStyles;
    document.head.appendChild(styleSheet);
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    const elementsToAnimate = document.querySelectorAll('.program-card, .testimonial-card, .contact-card, .hero-text, .hero-image-wrapper');
    elementsToAnimate.forEach(el => {
        el.classList.add('animate-in');
        observer.observe(el);
    });
});
