# Brainrot `$ROT` Helper

Script kecil buat:

1. **delegate EIP-7702** wallet ke `FeedDelegate`
2. **mint `$ROT`** lewat MCP `brainrot.dog`
3. **cek supply `$ROT`** lewat MCP `brainrot.dog`

Project ini pakai **Node.js**, **viem**, dan **dotenv**.

## 1. Install dulu

Masuk ke folder project lalu install dependency:

```bash
npm install
```

## 2. Siapkan file `.env`

Copy template:

```bash
cp .env.example .env
```

Isi `.env` sesuai kebutuhan.

Contoh:

```bash
# untuk mint via MCP
MCP_URL=https://www.brainrot.dog/api/mcp
MINT_ADDRESS=0xyourdelegatedwalletaddress
MINT_COUNT=1
RETRY_DELAY_MS=15000
MAX_RETRIES=0

# untuk delegate EIP-7702
RPC_URL=https://your-rpc-url
PRIVATE_KEY=0xyourprivatekey
```

Semua script otomatis baca `.env`, jadi tidak perlu `export` atau `for /f`.

## 3. Delegate wallet dulu

Sebelum mint, wallet harus sudah delegated ke:

`0x1D370cFCeD3c7F9101f5dCa5EE626447276d20be`

Jalankan:

```bash
npm run delegate
```

Kalau sukses, output akan tampil kurang lebih begini:

```bash
EIP-7702 delegation updated for 0x...
Delegate contract: 0x1D370cFCeD3c7F9101f5dCa5EE626447276d20be
Tx hash: 0x...
```

Kalau wallet sudah pernah delegate ke contract yang sama, script akan bilang wallet sudah delegated dan stop.

## 4. Cek address mint

Script mint butuh **address wallet yang sudah delegated**.

Pilih salah satu:

1. isi `MINT_ADDRESS=0x...`
2. atau isi `OWNER_PRIVATE_KEY=0x...`
3. atau isi `PRIVATE_KEY=0x...`

Kalau `MINT_ADDRESS` ada, script akan pakai itu.

## 5. Mint `$ROT`

Setelah wallet delegated, jalankan:

```bash
npm run mint
```

Default:

- `MINT_COUNT=1` → mint 1 slot
- 1 slot = **25,500 ROT**

Kalau mau batch mint:

```bash
MINT_COUNT=5 npm run mint
```

Maksimal `MINT_COUNT` adalah **10**.

## 6. Cek supply `$ROT`

Kalau cuma mau lihat sisa slot mint global, jalankan:

```bash
npm run supply
```

Contoh output:

```text
MCP endpoint: https://www.brainrot.dog/api/mcp
remaining mint slots: 15706 / 20000
```

## 7. Cara kerja script mint

Script `mint-rot.mjs` tidak kirim tx langsung ke chain.

Script ini:

1. call MCP `brainrot.dog`
2. cek status wallet lewat tool `check_wallet`
3. cek supply lewat tool `get_supply`
4. kalau wallet sudah delegated, call tool `mint` atau `batch_mint`

Jadi gas mint bukan dibayar dari script ini. Mint dieksekusi oleh relayer milik server `brainrot.dog`.

## 8. Kalau server MCP error

Kalau muncul `fetch failed`, `RELAYER_SERVER_URL not configured`, atau status `502/503/504`, itu error dari server/koneksi MCP, bukan dari wallet kamu.

Script sudah dibuat untuk retry otomatis:

- `RETRY_DELAY_MS=15000` → tunggu 15 detik
- `MAX_RETRIES=0` → retry tanpa batas

Kalau error koneksi `fetch failed`, script akan print:

```text
error fetch failed, retrying now
```

Kalau mau retry cuma 5 kali:

```bash
MAX_RETRIES=5 npm run mint
```

Kalau mau delay 30 detik:

```bash
RETRY_DELAY_MS=30000 npm run mint
```

Retry yang sama juga dipakai oleh `npm run supply`.

## 9. Script yang tersedia

### `npm run delegate`

Delegate EIP-7702 wallet ke `FeedDelegate`.

Butuh:

- `RPC_URL`
- `PRIVATE_KEY`

### `npm run mint`

Mint `$ROT` lewat MCP.

Butuh minimal:

- `MCP_URL`
- `MINT_ADDRESS`

Atau:

- `MCP_URL`
- `OWNER_PRIVATE_KEY`

### `npm run supply`

Cek supply live `$ROT` dari MCP.

Butuh minimal:

- `MCP_URL`

## 10. Catatan penting

1. `delegate-votes.mjs` butuh RPC yang sudah support **EIP-7702 / Pectra**
2. `mint-rot.mjs` butuh server MCP `brainrot.dog` dalam keadaan normal
3. `supply-rot.mjs` dan `mint-rot.mjs` sama-sama support retry untuk `fetch failed` dan `502/503/504`
4. Jangan commit file `.env` karena isinya private key
