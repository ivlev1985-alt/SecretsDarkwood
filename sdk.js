/* Yandex SDK stub для локальной разработки.
   На проде Yandex Games подменяет этот файл своим /sdk.js */
(function () {
  function storage() {
    var ls = null;
    try { ls = window.localStorage; } catch (e) { ls = null; }
    var mem = {};
    return {
      get: function (k) { try { if (ls) return ls.getItem(k); } catch (e) {} return mem[k] || null; },
      set: function (k, v) { try { if (ls) ls.setItem(k, v); } catch (e) {} mem[k] = String(v); }
    };
  }
  var store = storage();
  var playerData = {};
  try { playerData = JSON.parse(store.get('__sdk_player_data__') || '{}'); } catch (e) { playerData = {}; }

  var ysdkStub = {
    environment: { i18n: { lang: (navigator.language || 'ru').slice(0, 2) } },
    features: { LoadingAPI: { ready: function () { console.log('[SDK stub] LoadingAPI.ready'); } } },
    auth: {
      openAuthDialog: function () { return Promise.resolve(); }
    },
    getPlayer: function () {
      return Promise.resolve({
        getData: function () { return Promise.resolve(playerData); },
        setData: function (d) { playerData = Object.assign({}, playerData, d); try { store.set('__sdk_player_data__', JSON.stringify(playerData)); } catch (e) {} return Promise.resolve(); }
      });
    },
    getLeaderboards: function () {
      return Promise.resolve({ setScore: function () { return Promise.resolve(); }, getEntries: function () { return Promise.resolve({ entries: [] }); } });
    },
    adv: {
      showFullscreenAdv: function () { console.log('[SDK stub] fullscreen adv'); return Promise.resolve(); },
      showRewardedVideo: function () { console.log('[SDK stub] rewarded video'); return Promise.resolve(); }
    },
    openUrl: function (url) { try { window.open(url, '_blank'); } catch (e) {} }
  };
  window.ysdk = window.ysdk || ysdkStub;
  window.YaGames = window.YaGames || { init: function () { return Promise.resolve(window.ysdk); } };
})();
