/* ==========================================================================
   script.js – Portfolio [Vorname Nachname]
   Vanilla JavaScript, keine Abhängigkeiten.

   FUNKTIONEN
   1  Mobile Navigation      (#nav-toggle, #main-nav)
   2  Header-Scroll-Zustand  (#site-header, Klasse is-scrolled)
   3  Aktive Navigation      (IntersectionObserver, aria-current)
   4  Projektfilter          (#project-filter, [data-filter], [data-category])
   5  E-Mail kopieren        (#copy-email-button, #contact-email)

   BEWUSST NICHT IN JAVASCRIPT UMGESETZT
   - Smooth Scrolling, Header-Versatz und Zurück-nach-oben:
     Das erledigt style.css bereits (scroll-behavior, scroll-padding-top,
     prefers-reduced-motion). JavaScript würde nur doppelte Animationen erzeugen.
   - Projekt-Dialoge: index.html enthält keine <dialog>-Elemente.
   ========================================================================== */

(function () {
    'use strict';


    /* ======================================================================
       1  MOBILE NAVIGATION
       CSS-Zustand: .nav-toggle[aria-expanded="true"] + .main-nav
       Ab 64rem ist die Navigation immer sichtbar (Toggle per CSS ausgeblendet).
       ====================================================================== */

    function initMobileNavigation() {
        var header = document.querySelector('#site-header');
        var toggle = document.querySelector('#nav-toggle');

        if (!header || !toggle) {
            return;
        }

        // Zuordnung über aria-controls, Fallback auf die ID aus dem HTML
        var navId = toggle.getAttribute('aria-controls') || 'main-nav';
        var nav = document.getElementById(navId);

        if (!nav) {
            return;
        }

        var desktopQuery = window.matchMedia('(min-width: 64rem)');

        function isOpen() {
            return toggle.getAttribute('aria-expanded') === 'true';
        }

        function setExpanded(expanded) {
            toggle.setAttribute('aria-expanded', String(expanded));
        }

        function closeMenu(returnFocusToToggle) {
            if (!isOpen()) {
                return;
            }

            setExpanded(false);

            if (returnFocusToToggle) {
                toggle.focus();
            }
        }

        // Ausgangszustand eindeutig setzen
        setExpanded(false);

        // Öffnen und Schließen per Button (Enter und Leertaste funktionieren nativ)
        toggle.addEventListener('click', function () {
            setExpanded(!isOpen());
        });

        // Ein Klick-Listener für drei Fälle:
        // Link im Menü, Logo-Link im Header, Klick außerhalb des Headers
        document.addEventListener('click', function (event) {
            if (!isOpen()) {
                return;
            }

            var target = event.target;

            if (toggle.contains(target)) {
                return;
            }

            if (nav.contains(target)) {
                if (target.closest('a[href]')) {
                    closeMenu(false);
                }
                return;
            }

            if (!header.contains(target) || target.closest('a[href]')) {
                closeMenu(false);
            }
        });

        // Escape schließt das Menü; der Fokus geht zurück zum Button,
        // wenn er vorher im Header lag
        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || !isOpen()) {
                return;
            }

            closeMenu(header.contains(document.activeElement));
        });

        // Wandert der Tastaturfokus aus dem Header heraus, schließt das Menü
        header.addEventListener('focusout', function (event) {
            var nextFocus = event.relatedTarget;

            if (isOpen() && nextFocus && !header.contains(nextFocus)) {
                closeMenu(false);
            }
        });

        // Wechsel zur Desktop-Breite: Zustand zurücksetzen
        function handleBreakpointChange(event) {
            if (event.matches) {
                setExpanded(false);
            }
        }

        if (desktopQuery.addEventListener) {
            desktopQuery.addEventListener('change', handleBreakpointChange);
        } else if (desktopQuery.addListener) {
            // Ältere Safari-Versionen
            desktopQuery.addListener(handleBreakpointChange);
        }
    }


    /* ======================================================================
       2  HEADER-SCROLL-ZUSTAND
       CSS: .site-header.is-scrolled .site-header__inner (flachere Höhe)
       Ein passiver Scroll-Listener, der pro Frame höchstens einmal rechnet.
       Die Klasse wird nur bei echtem Zustandswechsel gesetzt. Zwei
       Schwellenwerte (Hysterese) verhindern Flackern an der Grenze.
       Ein IntersectionObserver würde ein zusätzliches Hilfselement im DOM
       brauchen, das es im HTML nicht gibt.
       ====================================================================== */

    function initHeaderScrollState() {
        var header = document.querySelector('#site-header');

        if (!header) {
            return;
        }

        var scrollOnThreshold = 24;
        var scrollOffThreshold = 4;
        var isScrolled = header.classList.contains('is-scrolled');
        var frameRequested = false;

        function updateHeaderState() {
            frameRequested = false;

            var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
            var nextState = isScrolled;

            if (!isScrolled && scrollY > scrollOnThreshold) {
                nextState = true;
            } else if (isScrolled && scrollY <= scrollOffThreshold) {
                nextState = false;
            }

            if (nextState !== isScrolled) {
                isScrolled = nextState;
                header.classList.toggle('is-scrolled', isScrolled);
            }
        }

        function handleScroll() {
            if (!frameRequested) {
                frameRequested = true;
                window.requestAnimationFrame(updateHeaderState);
            }
        }

        window.addEventListener('scroll', handleScroll, { passive: true });

        // Startzustand, falls der Browser eine Scrollposition wiederherstellt
        updateHeaderState();
    }


    /* ======================================================================
       3  AKTIVE NAVIGATION
       Markiert den Link der Sektion, die ein schmales Band im oberen Drittel
       des Viewports schneidet. Zustand: aria-current="location"
       (im CSS: .main-nav__link[aria-current]).
       Sektionen ohne Navigationslink (z. B. #arbeitsweise) setzen die
       Markierung zurück, damit nie ein falscher Punkt aktiv bleibt.
       ====================================================================== */

    function initActiveNavigation() {
        if (!('IntersectionObserver' in window)) {
            return;
        }

        var navLinks = Array.prototype.slice.call(
            document.querySelectorAll('.main-nav__link[href^="#"]')
        );
        var sections = Array.prototype.slice.call(
            document.querySelectorAll('main > section[id]')
        );

        if (!navLinks.length || !sections.length) {
            return;
        }

        var linkBySectionId = new Map();

        navLinks.forEach(function (link) {
            var sectionId = link.getAttribute('href').slice(1);

            if (sectionId) {
                linkBySectionId.set(sectionId, link);
            }
        });

        var visibleSectionIds = new Set();
        var activeLink = null;

        function updateActiveLink() {
            // Reihenfolge im Dokument entscheidet; bei Überlappung gewinnt die untere Sektion
            var currentSectionId = null;

            sections.forEach(function (section) {
                if (visibleSectionIds.has(section.id)) {
                    currentSectionId = section.id;
                }
            });

            var nextLink = currentSectionId ? (linkBySectionId.get(currentSectionId) || null) : null;

            if (nextLink === activeLink) {
                return;
            }

            if (activeLink) {
                activeLink.removeAttribute('aria-current');
            }

            if (nextLink) {
                nextLink.setAttribute('aria-current', 'location');
            }

            activeLink = nextLink;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    visibleSectionIds.add(entry.target.id);
                } else {
                    visibleSectionIds.delete(entry.target.id);
                }
            });

            updateActiveLink();
        }, {
            // Band von 25 % bis 50 % der Viewport-Höhe
            rootMargin: '-25% 0px -50% 0px',
            threshold: 0
        });

        sections.forEach(function (section) {
            observer.observe(section);
        });
    }


    /* ======================================================================
       4  PROJEKTFILTER
       HTML: #project-filter (hidden bis JS), .filter-button[data-filter],
             .project-grid__item[data-category="…"] (leerzeichengetrennt)
       Ausgeblendet wird über das Attribut hidden (CSS: [hidden] { display: none }).
       Es werden keine Inhalte entfernt oder verändert.
       ====================================================================== */

    function initProjectFilter() {
        var filterBar = document.querySelector('#project-filter');
        var grid = document.querySelector('#project-grid');

        if (!filterBar || !grid) {
            return;
        }

        var filterButtons = Array.prototype.slice.call(filterBar.querySelectorAll('[data-filter]'));
        var projectItems = Array.prototype.slice.call(grid.querySelectorAll('[data-category]'));

        if (!filterButtons.length || !projectItems.length) {
            return;
        }

        var allFilterValue = 'alle';
        var statusElement = document.querySelector('#project-filter-status');
        var emptyMessage = document.querySelector('#project-filter-empty');

        // Kategorien einmalig einlesen, nicht bei jedem Klick
        var projects = projectItems.map(function (item) {
            var categories = (item.getAttribute('data-category') || '')
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);

            return { element: item, categories: categories };
        });

        var activeButton = filterButtons.filter(function (button) {
            return button.getAttribute('aria-pressed') === 'true';
        })[0] || filterButtons.filter(function (button) {
            return (button.getAttribute('data-filter') || '').toLowerCase() === allFilterValue;
        })[0] || filterButtons[0];

        // Meldung für leere Ergebnisse: vorhandenes Element nutzen oder einmalig anlegen
        function getEmptyMessage() {
            if (emptyMessage) {
                return emptyMessage;
            }

            emptyMessage = document.createElement('p');
            emptyMessage.id = 'project-filter-empty';
            emptyMessage.className = 'section-intro project-filter__empty';
            emptyMessage.textContent = 'Zu dieser Kategorie gibt es noch keine Projekte. ' +
                'Wähle „Alle Projekte“, um die gesamte Übersicht zu sehen.';
            emptyMessage.hidden = true;
            grid.insertAdjacentElement('afterend', emptyMessage);

            return emptyMessage;
        }

        function setActiveButton(nextButton) {
            filterButtons.forEach(function (button) {
                var isActive = button === nextButton;

                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            activeButton = nextButton;
        }

        function announce(message) {
            if (statusElement) {
                statusElement.textContent = message;
            }
        }

        function applyFilter(button) {
            var filterValue = (button.getAttribute('data-filter') || allFilterValue).toLowerCase();
            var showAll = filterValue === allFilterValue;
            var visibleCount = 0;

            projects.forEach(function (project) {
                var matches = showAll || project.categories.indexOf(filterValue) !== -1;

                // DOM nur anfassen, wenn sich der Zustand ändert
                if (project.element.hidden === matches) {
                    project.element.hidden = !matches;
                }

                if (matches) {
                    visibleCount += 1;
                }
            });

            setActiveButton(button);

            var label = button.textContent.trim();
            var hasResults = visibleCount > 0;

            if (!hasResults || emptyMessage) {
                getEmptyMessage().hidden = hasResults;
            }

            if (!hasResults) {
                announce('Für „' + label + '“ gibt es aktuell keine Projekte.');
            } else if (showAll) {
                announce('Alle Projekte werden angezeigt (' + visibleCount + ').');
            } else {
                announce('Filter „' + label + '“: ' + visibleCount + ' ' +
                    (visibleCount === 1 ? 'Projekt' : 'Projekte') + ' angezeigt.');
            }
        }

        // Event-Delegation: ein Listener für alle Buttons
        filterBar.addEventListener('click', function (event) {
            var button = event.target.closest('[data-filter]');

            if (!button || !filterBar.contains(button) || button === activeButton) {
                return;
            }

            applyFilter(button);
        });

        // Ausgangszustand abgleichen und Filterleiste einblenden
        setActiveButton(activeButton);
        filterBar.hidden = false;
    }


    /* ======================================================================
       5  E-MAIL-ADRESSE KOPIEREN
       HTML: #copy-email-button[data-copy-target], #contact-email (mailto:),
             #copy-email-feedback (Live-Region, visuell versteckt)
       Sichtbare Rückmeldung über den Button-Text, hörbare über die Live-Region.
       ====================================================================== */

    function initEmailCopy() {
        var copyButton = document.querySelector('#copy-email-button');

        if (!copyButton) {
            return;
        }

        var targetId = copyButton.getAttribute('data-copy-target') || 'contact-email';
        var emailLink = document.getElementById(targetId);

        // Ohne Adressquelle bleibt der Button ausgeblendet (hidden)
        if (!emailLink) {
            return;
        }

        var feedbackElement = document.querySelector('#copy-email-feedback');
        var defaultLabel = copyButton.textContent.trim();
        var resetTimer = null;

        function readEmailAddress() {
            var href = emailLink.getAttribute('href') || '';

            if (!/^mailto:/i.test(href)) {
                return '';
            }

            var address = href.slice(7).split('?')[0];

            try {
                address = decodeURIComponent(address);
            } catch (error) {
                // Ungültige Kodierung: Rohwert behalten
            }

            address = address.trim();

            // Platzhalter wie [E-Mail-Adresse] und ungültige Werte nicht kopieren
            var looksValid = /^[^\s@\[\]]+@[^\s@\[\]]+\.[^\s@\[\]]+$/.test(address);

            return looksValid ? address : '';
        }

        function showFeedback(buttonLabel, message) {
            window.clearTimeout(resetTimer);

            copyButton.textContent = buttonLabel;

            if (feedbackElement) {
                feedbackElement.textContent = message;
            }

            resetTimer = window.setTimeout(function () {
                copyButton.textContent = defaultLabel;

                if (feedbackElement) {
                    feedbackElement.textContent = '';
                }
            }, 3500);
        }

        // Fallback für Browser ohne Clipboard API oder ohne sicheren Kontext
        function copyWithTemporaryField(text) {
            var previouslyFocused = document.activeElement;
            var helperField = document.createElement('textarea');

            helperField.value = text;
            helperField.className = 'visually-hidden';
            helperField.setAttribute('readonly', '');
            helperField.setAttribute('tabindex', '-1');
            document.body.appendChild(helperField);

            helperField.select();
            helperField.setSelectionRange(0, text.length);

            var wasCopied = false;

            try {
                wasCopied = document.execCommand('copy');
            } catch (error) {
                wasCopied = false;
            }

            document.body.removeChild(helperField);

            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus({ preventScroll: true });
            }

            return wasCopied;
        }

        function copyText(text) {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
                return navigator.clipboard.writeText(text).then(function () {
                    return true;
                }).catch(function () {
                    return copyWithTemporaryField(text);
                });
            }

            return Promise.resolve(copyWithTemporaryField(text));
        }

        // Letzter Ausweg: Adresse markieren, damit sie manuell kopiert werden kann
        function selectEmailLinkText() {
            var selection = window.getSelection ? window.getSelection() : null;

            if (!selection || !document.createRange) {
                return;
            }

            var range = document.createRange();
            range.selectNodeContents(emailLink);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        copyButton.addEventListener('click', function () {
            var address = readEmailAddress();

            if (!address) {
                showFeedback(
                    'Keine Adresse hinterlegt',
                    'Es ist noch keine gültige E-Mail-Adresse hinterlegt.'
                );
                return;
            }

            copyText(address).then(function (wasCopied) {
                if (wasCopied) {
                    showFeedback(
                        'E-Mail-Adresse kopiert',
                        'Die E-Mail-Adresse wurde in die Zwischenablage kopiert.'
                    );
                } else {
                    selectEmailLinkText();
                    showFeedback(
                        'Bitte manuell kopieren',
                        'Kopieren war nicht möglich. Die E-Mail-Adresse ist markiert und kann mit Strg+C oder Cmd+C kopiert werden.'
                    );
                }
            });
        });

        copyButton.hidden = false;
    }


    /* ======================================================================
       INITIALISIERUNG
       script.js wird mit defer geladen. Der DOMContentLoaded-Zweig ist nur
       eine Absicherung, falls die Datei einmal ohne defer eingebunden wird.
       ====================================================================== */

    function init() {
        initMobileNavigation();
        initHeaderScrollState();
        initActiveNavigation();
        initProjectFilter();
        initEmailCopy();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();

    /* ======================================================================
       6  BILDERKARUSSELL
       HTML: [data-carousel] mit .carousel__track, .carousel__slide,
             .carousel__controls (hidden bis JS), .carousel__button--prev/--next,
             .carousel__status (Live-Region)
       Das Scrollen und Einrasten übernimmt das CSS (scroll-snap). JavaScript
       ergänzt Buttons, Zähler und Pfeiltasten. Funktioniert für jedes
       Karussell mit diesem Aufbau, auch in anderen Projekt-Details.
       ====================================================================== */

    function initCarousels() {
        var carousels = document.querySelectorAll('[data-carousel]');

        if (!carousels.length) {
            return;
        }

        var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        function setUpCarousel(carousel) {
            var track = carousel.querySelector('.carousel__track');
            var controls = carousel.querySelector('.carousel__controls');
            var prevButton = carousel.querySelector('.carousel__button--prev');
            var nextButton = carousel.querySelector('.carousel__button--next');
            var statusElement = carousel.querySelector('.carousel__status');

            if (!track || !controls || !prevButton || !nextButton) {
                return;
            }

            var slides = Array.prototype.slice.call(track.querySelectorAll('.carousel__slide'));

            // Bei nur einem Bild bleibt die Steuerung ausgeblendet
            if (slides.length < 2) {
                return;
            }

            var currentIndex = -1;
            var frameRequested = false;

            function setButtonDisabled(button, isDisabled) {
                if (isDisabled) {
                    button.setAttribute('aria-disabled', 'true');
                } else {
                    button.removeAttribute('aria-disabled');
                }
            }

            function updateState(index) {
                currentIndex = index;

                if (statusElement) {
                    statusElement.textContent = 'Bild ' + (index + 1) + ' von ' + slides.length;
                }

                setButtonDisabled(prevButton, index === 0);
                setButtonDisabled(nextButton, index === slides.length - 1);
            }

            // Welche Folie liegt gerade am linken Rand des Scrollbereichs?
            function getClosestIndex() {
                var closestIndex = 0;
                var smallestDistance = Infinity;

                slides.forEach(function (slide, index) {
                    var distance = Math.abs(slide.offsetLeft - track.scrollLeft);

                    if (distance < smallestDistance) {
                        smallestDistance = distance;
                        closestIndex = index;
                    }
                });

                return closestIndex;
            }

            function goTo(index) {
                var targetIndex = Math.max(0, Math.min(slides.length - 1, index));

                track.scrollTo({
                    left: slides[targetIndex].offsetLeft,
                    behavior: motionQuery.matches ? 'auto' : 'smooth'
                });

                if (targetIndex !== currentIndex) {
                    updateState(targetIndex);
                }
            }

            prevButton.addEventListener('click', function () {
                if (prevButton.getAttribute('aria-disabled') !== 'true') {
                    goTo(currentIndex - 1);
                }
            });

            nextButton.addEventListener('click', function () {
                if (nextButton.getAttribute('aria-disabled') !== 'true') {
                    goTo(currentIndex + 1);
                }
            });

            // Pfeiltasten, Pos1 und Ende, solange der Scrollbereich selbst den Fokus hat
            track.addEventListener('keydown', function (event) {
                if (event.target !== track) {
                    return;
                }

                var targetIndex = null;

                if (event.key === 'ArrowLeft') {
                    targetIndex = currentIndex - 1;
                } else if (event.key === 'ArrowRight') {
                    targetIndex = currentIndex + 1;
                } else if (event.key === 'Home') {
                    targetIndex = 0;
                } else if (event.key === 'End') {
                    targetIndex = slides.length - 1;
                }

                if (targetIndex !== null) {
                    event.preventDefault();
                    goTo(targetIndex);
                }
            });

            // Wischen oder Scrollen mit Maus/Touch: Zähler nachführen, höchstens einmal pro Frame
            track.addEventListener('scroll', function () {
                if (frameRequested) {
                    return;
                }

                frameRequested = true;

                window.requestAnimationFrame(function () {
                    frameRequested = false;

                    var nextIndex = getClosestIndex();

                    if (nextIndex !== currentIndex) {
                        updateState(nextIndex);
                    }
                });
            }, { passive: true });

            updateState(getClosestIndex());
            controls.hidden = false;
        }

        Array.prototype.forEach.call(carousels, setUpCarousel);
    }

    function init() {
        initMobileNavigation();
        initHeaderScrollState();
        initActiveNavigation();
        initProjectFilter();
        initEmailCopy();
        initCarousels();
    }