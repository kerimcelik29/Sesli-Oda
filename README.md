# Sesver

Sesver, davet bağlantısıyla katılınan sesli sohbet ve ekran paylaşımı uygulamasıdır. Web istemcisi ve Electron masaüstü kabuğuyla çalışır.

## Gereksinimler

- Node.js 22 veya üzeri
- Docker Desktop

## Yerel geliştirme

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. Bağımlılıkları yükleyin: `npm install`
3. Mevcut LiveKit sunucusunun adres ve anahtarlarını `.env` dosyasına girin. Yerel kullanım için `APP_PUBLIC_URL=http://localhost:5173` ve `APP_ORIGIN=http://localhost:5173` değerlerini kullanın. API adresini boş bırakırsanız Vite istekleri `127.0.0.1:13001` adresine proxy'ler.
4. API hizmetini başlatın: `docker compose up --build api`
5. Ayrı bir terminalde istemciyi başlatın: `npm run dev`
6. `http://localhost:5173` adresini açıp bir oda oluşturun.

Docker Compose mevcut LiveKit sunucusuna bağlanır; LiveKit servisi oluşturmaz, başlatmaz veya durdurmaz.

Yeni odalara ülkelerin başkentlerinden rastgele bir isim verilir. Davet bağlantıları, odaları benzersiz tutmak için ayrı bir kimlik kullanır.

Oda oluştururken veya davetle katılırken ad ve soyad istenir. Her katılımcıya rastgele bir avatar atanır; avatar oda içindeki diğer katılımcılara da gösterilir.

Ana ekranda son ziyaret edilen en fazla altı oda, başkent adı ve katılım bağlantısıyla birlikte tarayıcının yerel depolamasında tutulur.
Ad, soyad ve avatar da aynı cihazdaki tarayıcıda hatırlanır; sonraki girişlerde yeniden sorulmaz. Oda sohbeti LiveKit veri kanalı üzerinden gerçek zamanlı iletilir ve mesajlar odadan ayrılınca silinir.
Yeni gelen sohbet mesajları kısa bir sesli bildirim çalar. Yeni oda oluştururken `ROOM_CREATE_PASSWORD` istenir. Varsayılan şifre `krm`'dir; sunucuda `.env` içinde `ROOM_CREATE_PASSWORD` ile değiştirilebilir. API şifreyi ayrıca doğrular; davet bağlantısıyla mevcut odaya katılmak için bu şifre gerekmez.

`LIVEKIT_API_URL`, sunucudaki mevcut LiveKit API'sine API konteynerinden erişilen adres; `LIVEKIT_WS_URL` ise kullanıcıların tarayıcılarından erişebileceği WebSocket (`wss://...`) adresidir. LiveKit API anahtarı ve gizli anahtarı mevcut LiveKit yapılandırmasıyla eşleşmelidir. Bunları Git'e eklemeyin veya GitHub Actions secret'larına koymayın. `API_HOST_PORT` yalnızca loopback arayüzüne bağlanır; canlı web API istekleri nginx üzerinden API konteynerine aktarılır.

## Masaüstü paketleri

`npm run desktop` mevcut işletim sistemi için paket üretir. Windows kurulum dosyası Windows'ta, macOS disk imajı ise macOS'ta oluşturulmalıdır.

Odalar boş kaldıktan 10 dakika sonra kapanır. Sunucu her odayı 20 katılımcıyla sınırlar. Katılım belirteci oda özelinde ve bir saat geçerlidir.

## Sunucuya otomatik dağıtım

`.github/workflows/ci.yml`, `main` dalına push ve pull request'lerde uygulamayı derler. `.github/workflows/deploy.yml`, `main` dalına yapılan push'un CI adımları başarılı olunca yalnızca Sesver'in `api` ve `web` Compose servislerini dağıtır. Workflow `workflow_dispatch` ile elle de çalıştırılabilir. `DEPLOY_SSH_HOST` GitHub değişkeni tanımlı değilse deploy atlanır. Bu çalışma ortamından sunucuya bağlanılmaz ve deploy denenmez.

Sunucuda Docker Compose kurulu olmalı; deploy kullanıcısının Docker çalıştırma ve `/opt/sesver` dizinine yazma izni olmalıdır. Ayrı bir deploy SSH anahtarı kullanın; diğer uygulamanın anahtarını veya zorunlu komutunu değiştirmeyin. Bu projedeki `deploy/remote-deploy.sh` betiğini sunucuda `/usr/local/sbin/sesver-remote-deploy` konumuna kurun ve yalnızca Sesver için oluşturulan public key'i deploy kullanıcısının `authorized_keys` dosyasına şu zorunlu komutla ekleyin:

```text
restrict,command="/usr/local/sbin/sesver-remote-deploy" ssh-ed25519 <KEY_BASE64> sesver-deploy
```

`deploy/remote-deploy.sh` dosyasını güvenli bir yöntemle sunucuya kopyaladıktan sonra `sudo install -D -m 755 deploy/remote-deploy.sh /usr/local/sbin/sesver-remote-deploy` komutuyla kurun. İlk deploy öncesinde deploy kullanıcısına ait `/opt/sesver/.env` dosyasını elle oluşturup mevcut LiveKit'in `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` değerlerini güvenli biçimde girin; bu sırlar deploy paketiyle taşınmaz ve GitHub'a eklenmez. `LIVEKIT_API_URL`, API konteynerinin mevcut LiveKit'e erişebildiği adres olmalıdır. `VITE_API_BASE_URL` canlı derlemede gerekmez; frontend API çağrıları aynı origin nginx proxy'sine gider. Varsayılan web portu `18080`, API loopback portu `13001`'dir.

GitHub deposunun **Settings → Secrets and variables → Actions** bölümünde şu repository variables değerlerini ekleyin:

- `DEPLOY_SSH_HOST`: sunucu IP'si/adresi.
- `DEPLOY_SSH_PORT`: SSH portu (`25416`).
- `DEPLOY_SSH_USER`: deploy kullanıcısı.
- `DEPLOY_URL`: GitHub Actions production environment bağlantısı (`https://sesver.online`).
- `LIVEKIT_WS_URL`: kullanıcıların erişebildiği mevcut LiveKit `wss://...` adresi. Henüz ayarlı değilse otomatik deploy bu değer eklenene kadar durur.
- İsteğe bağlı: `APP_PUBLIC_URL`, `APP_ORIGIN`, `APP_PORT`, `API_HOST_PORT`, `LIVEKIT_API_URL`.

Şu değerleri **Actions secrets** olarak ekleyin:

- `DEPLOY_SSH_KEY`: Sesver için oluşturulan SSH private key.
- `DEPLOY_SSH_KNOWN_HOSTS`: doğrulanmış sunucu host key kaydı; `25416` portu için `[sunucu-adresi]:25416` biçiminde olmalıdır.

`sesver.online` domaininin DNS yönetiminde kök domain için sunucu IP'sine bir `A` kaydı oluşturun. `byte.dns-parking.com` ve `pixel.dns-parking.com` nameserver adresleridir; tek başlarına domaini sunucuya yönlendirmezler. Sunucudaki reverse proxy'de HTTPS/TLS kurup `sesver.online` hostunu `http://127.0.0.1:18080` adresine yönlendirin. Reverse proxy ayarları bu dağıtımın parçası değildir; mevcut başka bir uygulamaya ait ayarları değiştirmeyin. Bu adımlar ve LiveKit public WebSocket adresi tamamlanana kadar web uygulamasının canlı davet/oda özellikleri kullanıma hazır olmaz.
