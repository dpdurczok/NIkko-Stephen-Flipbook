(function() {
  // 1) real‐VH hack
  function setRealVh() {
    document.documentElement.style.setProperty(
      '--vh',
      `${window.innerHeight * 0.01}px`
    );
  }
  setRealVh();
  window.addEventListener('resize', setRealVh);

  // 2) unified exists() for file:// and http(s)://
  function exists(num, ext) {
    const url = `assets/page${num}.${ext}`;
    if (location.protocol === 'file:') {
      return new Promise(resolve => {
        if (ext === 'mp4') {
          const v = document.createElement('video');
          v.src = url;
          v.onloadedmetadata = () => resolve(true);
          v.onerror        = () => resolve(false);
        } else {
          const img = new Image();
          img.src    = url;
          img.onload = () => resolve(true);
          img.onerror= () => resolve(false);
        }
      });
    }
    return fetch(url, { method: 'HEAD' })
      .then(res => res.ok)
      .catch(() => false);
  }

  // 3) set up the flipbook, return a promise when done
  function startFlipbook() {
    return (async () => {
      const fb = $('#flipbook');
      const exts = ['png','jpg','jpeg','mp4'];
      let pages = [], videoPageNum = null;

      // discover pages
      for (let i = 1; ; i++) {
        let found = null;
        for (let e of exts) {
          if (await exists(i, e)) { found = e; break; }
        }
        if (!found) break;
        pages.push({ num: i, ext: found, file: `page${i}.${found}` });
        if (found === 'mp4') videoPageNum = i;
      }
      if (!pages.length) {
        console.error('No page files found in assets/');
        return;
      }

      // build markup
      pages.forEach((p, idx) => {
        const $pg = $('<div>').addClass('page');
        if (p.ext === 'mp4') {
          const $v = $('<video>', {
            id: 'video-page',
            muted: true,
            autoplay: true,    // ensure autoplay
            playsinline: true, // inline on iOS
            controls: false,
            preload: 'metadata'
          }).css({ width:'100%', height:'100%', objectFit:'cover' });
          $('<source>', { src:`assets/${p.file}`, type:'video/mp4' }).appendTo($v);
          $pg.append($v);
        } else {
          $('<img>', { src:`assets/${p.file}`, alt:`Page ${p.num}` }).appendTo($pg);
        }
        if (idx === pages.length - 1) {
          $('<a>', {
            href: 'https://drive.google.com/drive/folders/1RflXkSgh1AHwnBYUk3zVf06pVOywQc4J?usp=drive_link',
            target: '_blank',
            class: 'download-banner',
            title: 'Download Memories'
          }).append(
            $('<img>', {
              src: 'assets/icon_download.png',
              alt: 'Download Memories'
            })
          ).appendTo($pg);
        }
        fb.append($pg);
      });

      // wait until the cover asset actually loads
      const firstEl = $('.page').first().find('img, video').get(0);
      await new Promise(resolve => {
        if (!firstEl) return resolve();
        if (firstEl.tagName === 'VIDEO') {
          if (firstEl.readyState >= 1) resolve();
          else {
            firstEl.onloadedmetadata = resolve;
            firstEl.onerror          = resolve;
          }
        } else {
          if (firstEl.complete) resolve();
          else {
            firstEl.onload  = resolve;
            firstEl.onerror = resolve;
          }
        }
      });

      // init turn.js
      const videoEl = $('#video-page').get(0);
      fb.turn({
        width: 720,
        height: 1280,
        autoCenter: false,
        display: 'single',
        acceleration: true,
        gradients: true,
        elevation: 50,
        corners: 'tr,br',
        when: {
          turning: () => {
            if (videoEl) {
              videoEl.pause();
              videoEl.currentTime = 0;
            }
          },
          turned: (e, page) => {
            toggleArrows(page);
            if (page === videoPageNum && videoEl) {
              videoEl.muted    = false;
              videoEl.controls = true;
              videoEl.play().catch(()=>{});
            } else if (videoEl) {
              videoEl.controls = false;
            }
          }
        }
      });

      // show/hide nav arrows
      function toggleArrows(page) {
        $('#prev-btn')[ page <= 1           ? 'hide' : 'show' ]();
        $('#next-btn')[ page >= pages.length ? 'hide' : 'show' ]();
      }
      toggleArrows(1);

      // navigation helpers
      function goTo(page) {
        page = Math.min(Math.max(page, 1), pages.length);
        toggleArrows(page);
        fb.turn('page', page);
      }
      $('#prev-btn').click(() => goTo(fb.turn('page') - 1));
      $('#next-btn').click(() => goTo(fb.turn('page') + 1));
      $(document).keydown(e => {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(fb.turn('page') - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(fb.turn('page') + 1); }
      });
      let touchX = null;
      fb.on('touchstart', e => { touchX = e.originalEvent.touches[0].clientX; });
      fb.on('touchend',   e => {
        if (touchX === null) return;
        const dx = touchX - e.originalEvent.changedTouches[0].clientX;
        if (dx > 50)       goTo(fb.turn('page') + 1);
        else if (dx < -50) goTo(fb.turn('page') - 1);
        touchX = null;
      });

      // pause/resume when tab visibility changes
      document.addEventListener('visibilitychange', () => {
        if (!videoEl) return;
        if (document.hidden) {
          videoEl.pause();
        } else {
          const curr = fb.turn('page');
          if (curr === videoPageNum) {
            videoEl.play().catch(()=>{});
          }
        }
      });

      // responsive scaling
      function resizeFlipbook() {
        const vp = document.querySelector('.viewport');
        const w  = vp.clientWidth;
        const h  = vp.clientHeight;
        const s  = Math.min(w/720, h/1280);
        document.querySelector('.flipbook-container')
                .style.transform = `scale(${s})`;
      }
      window.addEventListener('resize', resizeFlipbook);
      resizeFlipbook();
    })();
  }

  // 4) on load → wait for both init & 2 s delay → hide loader/show
  window.addEventListener('load', () => {
    const initPromise  = startFlipbook();
    const delayPromise = new Promise(res => setTimeout(res, 2000));
    Promise.all([initPromise, delayPromise]).then(() => {
      document.getElementById('loader').style.display       = 'none';
      document.querySelector('.viewport').style.visibility = 'visible';

      // ensure mobile actually starts the video if it's page 1
      const videoEl = document.getElementById('video-page');
      if (videoEl) {
        videoEl.play().catch(()=>{});
      }
    });
  });
})();
