#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <objbase.h>
#include <bcrypt.h>
#include <intrin.h>
#include <io.h>
#include <fcntl.h>
#include <cstdarg>
#include <climits>
#include <cwctype>
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <map>
#include <unordered_map>
#include <unordered_set>
#include <regex>
#include <algorithm>
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "version.lib")
#pragma comment(lib, "bcrypt.lib")

using namespace std;

static bool mo2;
static wstring srn(wstring s, bool lat) {
    if (!mo2) return s;
    static const wchar_t* const fm[] = {L"вортексе", L"вортекса", L"вортексу", L"вортексом", L"вортекс", L"vortex", L"Vortex"};
    for (int i = 0; i < (lat ? 7 : 5); i++) {
        size_t n = wcslen(fm[i]);
        for (size_t p = 0; (p = s.find(fm[i], p)) != wstring::npos; p += 3) s.replace(p, n, L"MO2");
    }
    return s;
}
static int pf(const wchar_t* f, ...) {
    va_list a, c;
    va_start(a, f);
    int n;
    if (!mo2) n = vwprintf(f, a);
    else {
        wstring g = srn(f, true);
        va_copy(c, a);
        wstring b(_vscwprintf(g.c_str(), c) + 1, 0);
        va_end(c);
        vswprintf_s(b.data(), b.size(), g.c_str(), a);
        b.pop_back();
        n = fputws(srn(b, false).c_str(), stdout);
    }
    va_end(a);
    return n;
}
#define wprintf(...) (pf(__VA_ARGS__), fflush(stdout))

extern "C" uint32_t crc32c_hw(uint32_t c, const void* p, size_t n);

struct Err { wstring m; };

static wstring W(const string& s) {
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), 0, 0);
    wstring r(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), r.data(), n);
    return r;
}
static string U(const wstring& s) {
    int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), 0, 0, 0, 0);
    string r(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), r.data(), n, 0, 0);
    return r;
}
static wstring lc(wstring s) { CharLowerBuffW(s.data(), (DWORD)s.size()); return s; }
static wstring disp(const wstring& p) { return p.rfind(L"\\\\?\\", 0) ? p : p.substr(4); }
static bool ends(const wstring& s, const wchar_t* x) { size_t n = wcslen(x); return s.size() >= n && !_wcsicmp(s.c_str() + s.size() - n, x); }
static bool exists(const wstring& p) { return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES; }

static wstring lp(wstring p) {
    while (!p.empty() && p.back() == L'"') p.pop_back();
    if (!p.rfind(L"\\\\?\\", 0)) return p;
    DWORD n = GetFullPathNameW(p.c_str(), 0, 0, 0);
    wstring r(n, 0);
    r.resize(GetFullPathNameW(p.c_str(), n, r.data(), 0));
    while (r.size() > 3 && r.back() == L'\\') r.pop_back();
    return r.rfind(L"\\\\", 0) ? L"\\\\?\\" + r : L"\\\\?\\UNC\\" + r.substr(2);
}

static uint32_t crc32c_sw(uint32_t c, const void* p, size_t n) {
    static uint32_t t[256];
    if (!t[1])
        for (uint32_t i = 0; i < 256; i++) {
            uint32_t x = i;
            for (int k = 0; k < 8; k++) x = x >> 1 ^ (0x82F63B78u & (0u - (x & 1)));
            t[i] = x;
        }
    auto b = (const uint8_t*)p;
    c = ~c;
    while (n--) c = t[(c ^ *b++) & 0xff] ^ c >> 8;
    return ~c;
}
static bool sse42() { int r[4]; __cpuid(r, 1); return r[2] >> 20 & 1; }
static uint32_t (*const crc)(uint32_t, const void*, size_t) = sse42() ? crc32c_hw : crc32c_sw;

static bool fcrc(const wstring& p, uint32_t& c, uint64_t& sz) {
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, 0, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, 0);
    if (h == INVALID_HANDLE_VALUE) return false;
    static vector<uint8_t> buf(1 << 20);
    DWORD got;
    bool ok;
    c = 0, sz = 0;
    while ((ok = !!ReadFile(h, buf.data(), (DWORD)buf.size(), &got, 0)) && got) c = crc(c, buf.data(), got), sz += got;
    CloseHandle(h);
    return ok;
}

static bool fid(const wstring& p, BY_HANDLE_FILE_INFORMATION& i, DWORD fl) {
    HANDLE h = CreateFileW(p.c_str(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, 0, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | fl, 0);
    if (h == INVALID_HANDLE_VALUE) return false;
    BOOL ok = GetFileInformationByHandle(h, &i);
    CloseHandle(h);
    return !!ok;
}

static bool samef(const wstring& a, const wstring& b) {
    BY_HANDLE_FILE_INFORMATION x, y;
    return fid(a, x, FILE_FLAG_OPEN_REPARSE_POINT) && fid(b, y, FILE_FLAG_OPEN_REPARSE_POINT) && x.dwVolumeSerialNumber == y.dwVolumeSerialNumber && x.nFileIndexHigh == y.nFileIndexHigh && x.nFileIndexLow == y.nFileIndexLow;
}

static string sha256(const wstring& p) {
    static BCRYPT_ALG_HANDLE a = 0;
    if (!a && BCryptOpenAlgorithmProvider(&a, BCRYPT_SHA256_ALGORITHM, 0, 0)) return "";
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, 0, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, 0);
    if (h == INVALID_HANDLE_VALUE) return "";
    BCRYPT_HASH_HANDLE x = 0;
    BCryptCreateHash(a, &x, 0, 0, 0, 0, 0);
    static vector<uint8_t> buf(1 << 20);
    DWORD got;
    while (ReadFile(h, buf.data(), (DWORD)buf.size(), &got, 0) && got) BCryptHashData(x, buf.data(), got, 0);
    CloseHandle(h);
    uint8_t d[32];
    BCryptFinishHash(x, d, 32, 0);
    BCryptDestroyHash(x);
    string r;
    for (uint8_t c : d) r += "0123456789abcdef"[c >> 4], r += "0123456789abcdef"[c & 15];
    return r;
}

static string slurp(const wstring& p) {
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, 0, OPEN_EXISTING, 0, 0);
    if (h == INVALID_HANDLE_VALUE) throw Err{L"не открыть " + disp(p)};
    LARGE_INTEGER n;
    GetFileSizeEx(h, &n);
    string s((size_t)n.QuadPart, 0);
    DWORD got = 0;
    BOOL ok = ReadFile(h, s.data(), (DWORD)s.size(), &got, 0);
    CloseHandle(h);
    if (!ok || got != s.size()) throw Err{L"не прочитать " + disp(p)};
    return s;
}

static void spit(const wstring& p, const string& s, bool rep = false) {
    wstring t = rep ? p + L".tmp" : p;
    HANDLE h = CreateFileW(t.c_str(), GENERIC_WRITE, 0, 0, rep ? CREATE_ALWAYS : CREATE_NEW, 0, 0);
    if (h == INVALID_HANDLE_VALUE) throw Err{L"не создать " + disp(t)};
    DWORD put = 0;
    BOOL ok = WriteFile(h, s.data(), (DWORD)s.size(), &put, 0) && FlushFileBuffers(h);
    CloseHandle(h);
    if (!ok || put != s.size()) throw Err{L"не записать " + disp(t)};
    if (rep && !MoveFileExW(t.c_str(), p.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) throw Err{L"не заменить " + disp(p)};
}

static void mkdirs(const wstring& p) {
    size_t s = p.rfind(L"\\\\?\\UNC\\", 0) ? 7 : p.find(L'\\', p.find(L'\\', 8) + 1) + 1;
    for (size_t i = p.find(L'\\', s);; i = p.find(L'\\', i + 1)) {
        wstring d = p.substr(0, i);
        if (!CreateDirectoryW(d.c_str(), 0) && GetLastError() != ERROR_ALREADY_EXISTS) throw Err{L"не создать папку " + disp(d)};
        if (i == wstring::npos) return;
    }
}

static bool running(const wchar_t* exe) {
    HANDLE s = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (s == INVALID_HANDLE_VALUE) return false;
    PROCESSENTRY32W pe{sizeof pe};
    bool r = false;
    for (BOOL ok = Process32FirstW(s, &pe); ok && !r; ok = Process32NextW(s, &pe)) r = !_wcsicmp(pe.szExeFile, exe);
    CloseHandle(s);
    return r;
}

struct J {
    enum { NUL, BOOL, NUM, STR, ARR, OBJ };
    int t = NUL;
    bool b = false;
    string s;
    vector<string> k;
    vector<J> v;
    J* at(const char* key) {
        for (size_t i = 0; i < k.size(); i++) if (!_stricmp(k[i].c_str(), key)) return &v[i];
        return 0;
    }
    J& put(const char* key, J x) {
        if (J* p = at(key)) return *p = move(x);
        return k.push_back(key), v.push_back(move(x)), v.back();
    }
};

struct JP {
    const char *p, *e;
    [[noreturn]] void bad() { throw Err{L"битый json"}; }
    char peek() {
        while (p < e && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++;
        if (p >= e) bad();
        return *p;
    }
    void lit(const char* w) {
        size_t n = strlen(w);
        if ((size_t)(e - p) < n || memcmp(p, w, n)) bad();
        p += n;
    }
    unsigned hex4() {
        if (e - p < 4) bad();
        unsigned v = 0;
        for (int i = 0; i < 4; i++) {
            char c = *p++, l = c | 32;
            v = v << 4 | (c >= '0' && c <= '9' ? c - '0' : l >= 'a' && l <= 'f' ? l - 'a' + 10 : (bad(), 0));
        }
        return v;
    }
    string str() {
        if (peek() != '"') bad();
        p++;
        string r;
        for (;;) {
            if (p >= e) bad();
            char c = *p++;
            if (c == '"') return r;
            if (c != '\\') { r += c; continue; }
            if (p >= e) bad();
            switch (c = *p++) {
            case 'n': r += '\n'; break;
            case 't': r += '\t'; break;
            case 'r': r += '\r'; break;
            case 'b': r += '\b'; break;
            case 'f': r += '\f'; break;
            case 'u': {
                unsigned u = hex4();
                if (u >= 0xd800 && u < 0xdc00) {
                    lit("\\u");
                    unsigned lo = hex4();
                    if (lo < 0xdc00 || lo >= 0xe000) bad();
                    u = 0x10000 + ((u - 0xd800) << 10) + lo - 0xdc00;
                }
                if (u < 0x80) r += (char)u;
                else if (u < 0x800) r += (char)(0xc0 | u >> 6), r += (char)(0x80 | (u & 0x3f));
                else if (u < 0x10000) r += (char)(0xe0 | u >> 12), r += (char)(0x80 | (u >> 6 & 0x3f)), r += (char)(0x80 | (u & 0x3f));
                else r += (char)(0xf0 | u >> 18), r += (char)(0x80 | (u >> 12 & 0x3f)), r += (char)(0x80 | (u >> 6 & 0x3f)), r += (char)(0x80 | (u & 0x3f));
                break;
            }
            default: r += c;
            }
        }
    }
    J val() {
        J j;
        switch (peek()) {
        case '{':
            p++, j.t = J::OBJ;
            if (peek() == '}') return p++, j;
            for (;;) {
                j.k.push_back(str());
                if (peek() != ':') bad();
                p++;
                j.v.push_back(val());
                char c = peek();
                p++;
                if (c == '}') return j;
                if (c != ',') bad();
            }
        case '[':
            p++, j.t = J::ARR;
            if (peek() == ']') return p++, j;
            for (;;) {
                j.v.push_back(val());
                char c = peek();
                p++;
                if (c == ']') return j;
                if (c != ',') bad();
            }
        case '"': j.t = J::STR, j.s = str(); return j;
        case 't': lit("true"), j.t = J::BOOL, j.b = true; return j;
        case 'f': lit("false"), j.t = J::BOOL; return j;
        case 'n': lit("null"); return j;
        }
        const char* q = p;
        while (q < e && ((*q >= '0' && *q <= '9') || *q == '-' || *q == '+' || *q == '.' || *q == 'e' || *q == 'E')) q++;
        if (q == p) bad();
        j.t = J::NUM, j.s.assign(p, q), p = q;
        return j;
    }
};

static J pj(const string& s) {
    JP jp{s.data(), s.data() + s.size()};
    if (s.size() > 2 && !memcmp(s.data(), "\xEF\xBB\xBF", 3)) jp.p += 3;
    return jp.val();
}

static string js8(const string& u) {
    string r = "\"";
    for (unsigned char c : u) {
        if (c == '"' || c == '\\') r += '\\', r += (char)c;
        else if (c < 0x20) { char b[8]; sprintf_s(b, "\\u%04x", c); r += b; }
        else r += (char)c;
    }
    return r += '"';
}
static string js(const wstring& w) { return js8(U(w)); }

static void dump(const J& j, string& o) {
    switch (j.t) {
    case J::NUL: o += "null"; return;
    case J::BOOL: o += j.b ? "true" : "false"; return;
    case J::NUM: o += j.s; return;
    case J::STR: o += js8(j.s); return;
    }
    bool ob = j.t == J::OBJ;
    o += ob ? '{' : '[';
    for (size_t i = 0; i < j.v.size(); i++) {
        if (i) o += ',';
        if (ob) o += js8(j.k[i]), o += ':';
        dump(j.v[i], o);
    }
    o += ob ? '}' : ']';
}
static string dumps(const J& j) { string o; dump(j, o); return o += '\n'; }

static HANDLE jo;
static wstring jbk, jbd;
static void ev(string s) {
    DWORD w;
    if (jo) s += '\n', WriteFile(jo, s.data(), (DWORD)s.size(), &w, 0);
}
struct O {
    string o = "{";
    O(const char* t = 0) { if (t) a("t", t); }
    O& k(const char* f) { return o += o.size() > 1 ? ",\"" : "\"", o += f, o += "\":", *this; }
    O& s(const char* f, const wstring& v) { return k(f).o += js(srn(v, false)), *this; }
    O& a(const char* f, const char* v) { return k(f).o += js8(v), *this; }
    O& n(const char* f, long long v) { return k(f).o += to_string(v), *this; }
    O& b(const char* f, bool v) { return k(f).o += v ? "true" : "false", *this; }
    O& r(const char* f, const string& v) { return k(f).o += v, *this; }
    string str() const { return o + "}"; }
    void go() const { ev(str()); }
};
static string jarr(const vector<wstring>& v) {
    string r = "[";
    for (auto& x : v) r += (r.size() > 1 ? "," : "") + js(x);
    return r + "]";
}
static void wn(const wstring& m) { wprintf(L"!! %s\n", m.c_str()); O("warn").s("msg", m).go(); }
static void ph(const char* id, const wchar_t* l) { O("phase").a("id", id).s("label", l).go(); }
static void prog(const char* p, size_t d, size_t t, const wstring& it) {
    static ULONGLONG last;
    ULONGLONG now = GetTickCount64();
    if (!jo || (now - last < 100 && d != t)) return;
    last = now;
    O("progress").a("phase", p).n("done", d).r("total", t ? to_string(t) : "null").s("item", it).go();
}
static J dec;
static vector<char> du;
static const char* const okd[] = {"keep", "take", "each"}, * const oka[] = {"keep", "take", "both"};
static int dget(const wstring& id, int n, const char* const* nm) {
    J* x = dec.at(U(id).c_str());
    if (!x) return 0;
    du[x - dec.v.data()] = 1;
    for (int i = 0; i < n; i++) if (x->t == J::STR && x->s == nm[i]) return i + 1;
    wn(L"решение для " + id + L" не подходит, беру по режиму");
    return 0;
}

static const unordered_set<wstring> svc = {
    L"_mod_meta.json", L"_mod_snapshot.json", L"_structure_repair.json", L"_origin.json", L"_category.json", L"_build_meta.json",
    L"_build_info.json", L"_archive_info.json", L"_builds_order.json", L"_installed_manifest.json", L"_activation_state.json",
    L"_profiles.json", L"_launch_symlinks.json", L"_launch_copies.json", L"_launch_context.json", L"_launch_conflicts.json",
    L"_runtime_additions.json", L"_modscache_migrated.json", L"_release_plan.json", L"_release_history.json", L"_mod_history.json",
    L"_mod_history.json.bak", L"_mod_history.json.tmp", L"_mod_history.json.broken", L"_saved_configs", L"_addon_backup",
    L"_diagnostics", L"_settings_backup", L"_releases", L"_preview", L"_stale", L"_replaced", L"_native", L"_unsorted",
    L"_optimize_backup", L"_variants"};

struct F { wstring rel, key; uint64_t sz = 0; uint32_t c = 0; bool hashed = false, drop = false, up = false; };
struct M { wstring root, cat, dir, lid, orig, name, ver, desc, date, why; long long nid = 0; bool on = false, ex = false, skip = false, off = false; int ei = -1; vector<F> f; vector<wstring> add; J aj; int pri = 0; long long fid = 0; wstring fn, url, auth, shown, pic, nex; string fj; bool frz = false; };
static wstring fsp(const M& m, const F& f) { return m.root + (f.up ? L"\\root\\" : L"\\") + f.rel; }

static wstring dllver(const wstring& p) {
    DWORD z = 0, n = GetFileVersionInfoSizeW(p.c_str(), &z);
    if (!n) return L"";
    vector<uint8_t> b(n);
    VS_FIXEDFILEINFO* fi;
    UINT l;
    if (!GetFileVersionInfoW(p.c_str(), 0, n, b.data()) || !VerQueryValueW(b.data(), L"\\", (void**)&fi, &l) || !fi->dwFileVersionMS) return L"";
    return to_wstring(HIWORD(fi->dwFileVersionMS)) + L"." + to_wstring(LOWORD(fi->dwFileVersionMS)) + L"." + to_wstring(HIWORD(fi->dwFileVersionLS));
}
struct E { int from, to, fi; bool done = false, cut = false; };
struct X { int em, vm, ef, vf; };
struct D { int v, e; size_t n; bool same, lock = false; int c = 0, c0 = 0; };
struct Q { wstring p, k, s; };
struct A { int e, v; size_t n; wstring ea, va; int c = 0, c0 = 0; };

static void walk(const wstring& root, const wstring& rel, vector<F>& out, vector<wstring>& lnk, bool ex) {
    WIN32_FIND_DATAW fd;
    wstring q = rel.empty() ? root : root + L"\\" + rel;
    HANDLE h = FindFirstFileExW((q + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, FIND_FIRST_EX_LARGE_FETCH);
    if (h == INVALID_HANDLE_VALUE) throw Err{L"не прочитать папку " + disp(root) + L"\\" + rel};
    do {
        wstring n = fd.cFileName;
        if (n == L"." || n == L"..") continue;
        wstring r = rel.empty() ? n : rel + L"\\" + n;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) lnk.push_back(r);
        else if (ex && svc.count(lc(n))) continue;
        else if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) walk(root, r, out, lnk, ex);
        else out.push_back({r, lc(r), (uint64_t)fd.nFileSizeHigh << 32 | fd.nFileSizeLow});
    } while (FindNextFileW(h, &fd));
    FindClose(h);
}

static wstring ymd(__time64_t ts) {
    tm t;
    wchar_t b[16];
    return !_gmtime64_s(&t, &ts) && wcsftime(b, 16, L"%Y-%m-%d", &t) ? b : L"";
}

static void nm(M& m) {
    static const wregex rx(LR"(^(.+?)-(\d+)-(.*?)-*-(\d{9,11})(\.\d+)?$)"), rv(LR"(^(.*?)[ _-]*v?(\d+(?:\.\d+)+))"), rl(LR"(^(.+?) v?(\d+(?:\.\d+)+) (\d{2,6}) \S+ (\d{4}-\d{2}-\d{2})T)");
    wsmatch g;
    m.name = m.dir;
    if (!regex_match(m.dir, g, rx)) {
        if (regex_search(m.dir, g, rl)) m.name = g[1], m.ver = g[2], m.nid = _wtoi64(g[3].str().c_str()), m.date = g[4];
        else if (regex_search(m.dir, g, rv) && g[1].length()) m.name = g[1], m.ver = g[2];
        return;
    }
    m.name = g[1], m.nid = _wtoi64(g[2].str().c_str()), m.ver = g[3];
    replace(m.ver.begin(), m.ver.end(), L'-', L'.');
    m.date = ymd(_wtoi64(g[4].str().c_str()));
}

static int vcmp(const wstring& a, const wstring& b) {
    auto num = [](const wstring& s) {
        vector<long long> v;
        for (size_t i = 0; i < s.size();)
            if (iswdigit(s[i])) { long long n = 0; while (i < s.size() && iswdigit(s[i])) n = n * 10 + (s[i++] - L'0'); v.push_back(n); }
            else i++;
        return v;
    };
    vector<long long> x = num(a), y = num(b);
    if (x.empty() || y.empty()) return 0;
    x.resize(max(x.size(), y.size())), y.resize(x.size());
    return x < y ? -1 : x > y;
}

static int newer(const M& e, const M& v) {
    int r = vcmp(e.ver, v.ver);
    if (!r && (e.ver.empty() || v.ver.empty()) && !e.date.empty() && !v.date.empty() && e.date != v.date) r = e.date > v.date ? 1 : -1;
    return r;
}

static wstring hs(uint64_t n) {
    wchar_t b[32];
    if (n < 1024) swprintf_s(b, L"%llu Б", n);
    else if (n < 1 << 20) swprintf_s(b, L"%.1f КБ", n / 1024.0);
    else swprintf_s(b, L"%.1f МБ", n / 1048576.0);
    return b;
}

static wstring vd(const M& m) { return (m.ver.empty() ? L"версия ?" : m.ver) + (m.date.empty() ? L"" : L", " + m.date); }

static vector<int> order(vector<M>& ms, vector<E>& es) {
    int n = (int)ms.size();
    vector<int> by(n), deg(n), ret;
    vector<char> put(n);
    for (int i = 0; i < n; i++) by[i] = i;
    sort(by.begin(), by.end(), [&](int a, int b) {
        if (ms[a].ex != ms[b].ex) return ms[a].ex;
        if (ms[a].pri != ms[b].pri) return ms[a].pri < ms[b].pri;
        return ms[a].ex ? ms[a].ei < ms[b].ei : _wcsicmp(ms[a].dir.c_str(), ms[b].dir.c_str()) < 0;
    });
    for (int i : by) if (!ms[i].ex && !ms[i].on && !ms[i].skip) put[i] = 1, ret.push_back(i);
    auto dead = [&](int i) { return !ms[i].ex && (!ms[i].on || ms[i].skip); };
    for (auto& e : es) if (dead(e.from) || dead(e.to)) e.done = true; else deg[e.to]++;
    for (;;) {
        int u = -1;
        for (int i : by) if (!put[i] && !ms[i].skip && !deg[i]) { u = i; break; }
        if (u < 0) {
            // every cycle has a vortex loser edge, cutting those never touches exl files
            bool any = false;
            for (auto& e : es)
                if (!e.done && !ms[e.from].ex && !put[e.from] && !put[e.to]) e.done = e.cut = any = true, ms[e.from].f[e.fi].drop = true, deg[e.to]--;
            if (!any) return ret;
            continue;
        }
        put[u] = 1, ret.push_back(u);
        for (auto& e : es) if (!e.done && e.from == u) e.done = true, deg[e.to]--;
    }
}

static int pick(const wstring& q, int n) {
    if (jo) throw Err{L"в --json выбор только через --keep / --take / --vortex и --decisions"};
    static int con = -1;
    HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    DWORD md;
    if (con < 0) con = GetConsoleMode(in, &md) ? 1 : 0;
    if (!con) throw Err{L"для вопросов нужна консоль, или запусти с --keep / --take"};
    for (;;) {
        wprintf(L"%s > ", q.c_str());
        fflush(stdout);
        wchar_t b[64];
        DWORD got = 0;
        if (!ReadConsoleW(in, b, 63, &got, 0) || !got) throw Err{L"ввод закрыт, ничего не записано"};
        if (b[0] == L'q' || b[0] == L'й') throw Err{L"отменено, ничего не записано"};
        if (b[0] >= L'1' && b[0] < L'1' + n) return b[0] - L'0';
    }
}

static wstring stamp(bool iso) {
    SYSTEMTIME t;
    iso ? GetSystemTime(&t) : GetLocalTime(&t);
    wchar_t b[32];
    swprintf_s(b, iso ? L"%04u-%02u-%02uT%02u:%02u:%02uZ" : L"%04u%02u%02u-%02u%02u%02u", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond);
    return b;
}

static vector<J> byord(vector<J> v) {
    vector<pair<long long, size_t>> k;
    for (size_t i = 0; i < v.size(); i++) {
        J* o = v[i].at("order");
        k.push_back({o && o->t == J::NUM ? _atoi64(o->s.c_str()) : INT64_MAX, i});
    }
    stable_sort(k.begin(), k.end());
    vector<J> r;
    for (auto& x : k) r.push_back(move(v[x.second]));
    return r;
}

static vector<uint64_t> rdar(const wstring& p) {
    vector<uint64_t> r;
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, 0, OPEN_EXISTING, 0, 0);
    if (h == INVALID_HANDLE_VALUE) return r;
    uint8_t hd[40];
    DWORD got = 0;
    if (ReadFile(h, hd, 40, &got, 0) && got == 40 && *(uint32_t*)hd == 0x52414452) {
        LARGE_INTEGER at;
        at.QuadPart = *(int64_t*)(hd + 8);
        uint32_t n = *(uint32_t*)(hd + 16);
        string b(n < 28 || n > 1u << 28 ? 0 : n, 0);
        if (b.size() && SetFilePointerEx(h, at, 0, FILE_BEGIN) && ReadFile(h, b.data(), n, &got, 0) && got == n) {
            auto u = [&](size_t o) { return *(uint32_t*)(b.data() + o); };
            if (28ull + u(16) * 56ull + u(20) * 16ull + u(24) * 8ull == n)
                for (uint32_t i = 0; i < u(16); i++) r.push_back(*(uint64_t*)(b.data() + 28 + i * 56ull));
        }
    }
    CloseHandle(h);
    return r;
}

static void rmtree(const wstring& p) {
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW((p + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, 0);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        wstring n = fd.cFileName, q = p + L"\\" + n;
        if (n == L"." || n == L"..") continue;
        if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && !(fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) rmtree(q);
        else if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) RemoveDirectoryW(q.c_str());
        else SetFileAttributesW(q.c_str(), FILE_ATTRIBUTE_NORMAL), DeleteFileW(q.c_str());
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    RemoveDirectoryW(p.c_str());
}

static int sccx(const wchar_t* lib, const wchar_t* r6, const wchar_t* oc) {
    HMODULE h = LoadLibraryExW(lib, 0, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!h) return 3;
    auto sn = (void* (*)(const char*))GetProcAddress(h, "scc_settings_new");
    auto so = (void (*)(void*, const char*))GetProcAddress(h, "scc_settings_set_output_cache_file");
    auto sd = (void (*)(void*))GetProcAddress(h, "scc_settings_disable_error_popup");
    auto sc = (void* (*)(void*))GetProcAddress(h, "scc_compile");
    auto sk = (uint8_t (*)(void*))GetProcAddress(h, "scc_get_success");
    if (!sn || !so || !sd || !sc || !sk) return 3;
    void* s = sn(U(r6).c_str());
    so(s, U(oc).c_str());
    sd(s);
    return sk(sc(s)) ? 0 : 1;
}

static DWORD sccrun(const wstring& lib, const wstring& t, vector<Q>& er) {
    wstring lg = t + L"\\scc.log", me(MAX_PATH, 0);
    me.resize(GetModuleFileNameW(0, me.data(), MAX_PATH));
    SECURITY_ATTRIBUTES sa{sizeof sa, 0, TRUE};
    HANDLE f = CreateFileW(lg.c_str(), GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, 0, 0);
    if (f == INVALID_HANDLE_VALUE) throw Err{L"не создать " + disp(lg)};
    wstring cl = L"\"" + me + L"\" --scc \"" + disp(lib) + L"\" \"" + disp(t) + L"\\r6\" \"" + disp(t) + L"\\out\\final.redscripts\"";
    STARTUPINFOW si{sizeof si};
    si.dwFlags = STARTF_USESTDHANDLES, si.hStdOutput = si.hStdError = f;
    PROCESS_INFORMATION pi;
    BOOL ok = CreateProcessW(0, cl.data(), 0, 0, TRUE, CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS, 0, 0, &si, &pi);
    CloseHandle(f);
    if (!ok) throw Err{L"не запустить проверку скриптов"};
    DWORD rc = 2;
    if (WaitForSingleObject(pi.hProcess, 600000) != WAIT_OBJECT_0) TerminateProcess(pi.hProcess, 2);
    GetExitCodeProcess(pi.hProcess, &rc);
    CloseHandle(pi.hProcess), CloseHandle(pi.hThread);
    if (rc > 1) throw Err{L"scc_lib не отработал, код " + to_wstring(rc) + L", лог: " + disp(lg)};
    static const wregex re(LR"(\[ERROR[^\]]*\] \[([A-Z_]+)\] At (.+):(\d+):\d+:)");
    wstring s = W(slurp(lg)), pre = lc(disp(t) + L"\\r6\\scripts\\");
    vector<wstring> ln;
    for (size_t a = 0, b; a < s.size(); a = b + 1) {
        if ((b = s.find(L'\n', a)) == wstring::npos) b = s.size();
        ln.push_back(s.substr(a, b - a));
        if (!ln.back().empty() && ln.back().back() == L'\r') ln.back().pop_back();
    }
    for (size_t i = 0; i < ln.size(); i++) {
        wsmatch g;
        if (!regex_search(ln[i], g, re)) continue;
        wstring p = lc(g[2]);
        if (!p.rfind(pre, 0)) p = p.substr(pre.size());
        wstring m = i + 3 < ln.size() ? ln[i + 3] : L"";
        m.erase(0, m.find_first_not_of(L' '));
        er.push_back({p, p + L":" + g[3].str() + L" " + g[1].str(), g[1].str() + L": " + m});
    }
    if (rc && er.empty()) er.push_back({L"", L"?", L"компиляция не прошла, лог: " + disp(lg)});
    return rc;
}

static wstring qv(const string& raw) {
    wstring u = W(raw), o;
    for (size_t i = 0; i < u.size(); i++) {
        wchar_t c = u[i];
        if (c == L'"') continue;
        if (c != L'\\' || i + 1 == u.size()) { o += c; continue; }
        wchar_t d = u[++i];
        if (d == L'x') {
            unsigned v = 0;
            for (int n = 0; n < 4 && i + 1 < u.size() && iswxdigit(u[i + 1]); n++) {
                wchar_t h = towlower(u[++i]);
                v = v * 16 + (h <= L'9' ? h - L'0' : h - L'a' + 10);
            }
            o += (wchar_t)v;
        } else o += d == L'n' ? L'\n' : d == L't' ? L'\t' : d == L'r' ? L'\r' : d;
    }
    if (o.size() < 12 || o.rfind(L"@ByteArray(", 0) || o.back() != L')') return o;
    wstring in = o.substr(11, o.size() - 12), r;
    string b;
    for (wchar_t c : in) {
        if (c > 0xFF) return in;
        b += (char)c;
    }
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, b.data(), (int)b.size(), 0, 0);
    if (n <= 0) return in;
    r.resize(n);
    MultiByteToWideChar(CP_UTF8, 0, b.data(), (int)b.size(), r.data(), n);
    return r;
}

static unordered_map<string, wstring> qini(const wstring& p) {
    unordered_map<string, wstring> r;
    string s = slurp(p), sec = "general";
    if (!s.rfind("\xEF\xBB\xBF", 0)) s.erase(0, 3);
    auto un = [](const string& k) {
        string o;
        for (size_t i = 0; i < k.size(); i++)
            if (k[i] == '%' && i + 2 < k.size() && isxdigit((uint8_t)k[i + 1]) && isxdigit((uint8_t)k[i + 2])) o += (char)strtol(k.substr(i + 1, 2).c_str(), 0, 16), i += 2;
            else o += (char)tolower((uint8_t)k[i]);
        return o;
    };
    for (size_t a = 0, b; a < s.size(); a = b + 1) {
        b = s.find('\n', a);
        if (b == string::npos) b = s.size();
        string l = s.substr(a, b - a);
        while (!l.empty() && (l.back() == '\r' || l.back() == ' ' || l.back() == '\t')) l.pop_back();
        size_t z = l.find_first_not_of(" \t");
        if (z == string::npos || l[z] == ';') continue;
        if (l[z] == '[' && l.back() == ']') { sec = un(l.substr(z + 1, l.size() - z - 2)); continue; }
        size_t e = l.find('=', z);
        if (e == string::npos) continue;
        size_t ke = e, v = e + 1;
        while (ke > z && (l[ke - 1] == ' ' || l[ke - 1] == '\t')) ke--;
        while (v < l.size() && (l[v] == ' ' || l[v] == '\t')) v++;
        r[sec + '/' + un(l.substr(z, ke - z))] = qv(l.substr(v));
    }
    return r;
}

static vector<pair<wstring, wchar_t>> mlist(const string& s) {
    vector<pair<wstring, wchar_t>> r;
    unordered_set<wstring> seen;
    for (size_t a = 0, b; a < s.size(); a = b + 1) {
        b = s.find('\n', a);
        if (b == string::npos) b = s.size();
        string l = s.substr(a, b - a);
        if (!l.rfind("\xEF\xBB\xBF", 0)) l.erase(0, 3);
        size_t x = l.find_first_not_of(" \t\r"), y = l.find_last_not_of(" \t\r");
        if (x == string::npos || l[x] == '#') continue;
        wstring u = W(l.substr(x, y - x + 1));
        wchar_t p = L'+';
        if (wcschr(L"+-*", u[0])) {
            p = u[0];
            size_t q = u.find_first_not_of(L" \t", 1);
            if (q == wstring::npos) continue;
            u.erase(0, q);
        }
        if (lc(u) != L"overwrite" && seen.insert(lc(u)).second) r.push_back({u, p});
    }
    return r;
}

static wstring mver(wstring v) {
    if (v.size() > 1 && wcschr(L"fnd", v[0]) && (iswdigit(v[1]) || v[1] == L' ')) v.erase(0, v[1] == L' ' ? 2 : 1);
    if (v.size() > 1 && (v[0] == L'v' || v[0] == L'V') && iswdigit(v[1])) v.erase(0, 1);
    while (count(v.begin(), v.end(), L'.') > 1 && ends(v, L".0")) v.resize(v.size() - 2);
    return v;
}

static void mmeta(M& m) {
    if (!exists(m.root + L"\\meta.ini")) return;
    auto q = qini(m.root + L"\\meta.ini");
    auto g = [&](const string& k) { auto it = q.find(k); return it == q.end() ? wstring() : it->second; };
    wstring gn = lc(g("general/gamename")), rp = lc(g("general/repository")), fl = g("general/installationfile"), v = mver(g("general/version"));
    long long id = _wtoi64(g("general/modid").c_str());
    m.nid = id > 0 && (gn.empty() || gn == L"cyberpunk2077") && (rp.empty() || rp == L"nexus") ? id : 0;
    fl = fl.substr(fl.find_last_of(L"/\\") + 1);
    if (!v.empty()) m.ver = v;
    if (m.nid) m.fn = fl;
    M t;
    t.dir = fl.substr(0, fl.rfind(L'.'));
    nm(t);
    if (m.nid && t.nid == m.nid && !t.date.empty()) m.ver = t.ver, m.date = t.date;
    int n = _wtoi(g("installedfiles/size").c_str());
    for (int i = 1; i <= n; i++) {
        string b = "installedfiles/" + to_string(i) + "\\";
        if (_wtoi64(g(b + "modid").c_str()) == m.nid && _wtoi64(g(b + "fileid").c_str()) > 0) m.fid = _wtoi64(g(b + "fileid").c_str());
    }
    m.desc = g("general/comments"), m.auth = g("general/author");
    if (!m.nid) m.url = g("general/url");
}

static string tarout(const wstring& dir, const wstring& args) {
    SECURITY_ATTRIBUTES sa{sizeof sa, 0, TRUE};
    HANDLE r, w, nu = CreateFileW(L"NUL", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, 0);
    if (!CreatePipe(&r, &w, &sa, 0)) return "";
    SetHandleInformation(r, HANDLE_FLAG_INHERIT, 0);
    STARTUPINFOW si{};
    si.cb = sizeof si, si.dwFlags = STARTF_USESTDHANDLES, si.hStdInput = nu, si.hStdOutput = w, si.hStdError = nu;
    PROCESS_INFORMATION pi{};
    wchar_t sys[MAX_PATH];
    GetSystemDirectoryW(sys, MAX_PATH);
    wstring cmd = L"\"" + wstring(sys) + L"\\tar.exe\" " + args;
    string o;
    BOOL ok = CreateProcessW(0, cmd.data(), 0, 0, TRUE, CREATE_NO_WINDOW, 0, disp(dir).c_str(), &si, &pi);
    CloseHandle(w), CloseHandle(nu);
    char b[65536];
    DWORD n, rc = 1;
    while (ok && ReadFile(r, b, sizeof b, &n, 0) && n && o.size() < 1u << 26) o.append(b, n);
    CloseHandle(r);
    if (!ok) return "";
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &rc);
    CloseHandle(pi.hProcess), CloseHandle(pi.hThread);
    return rc ? "" : o;
}

static bool fcfg(const wstring& a, wstring* x) {
    if (!exists(a)) return false;
    size_t c = a.rfind(L'\\');
    wstring d = a.substr(0, c), n = a.substr(c + 1);
    string l = tarout(d, L"-tf \"" + n + L"\""), e;
    for (size_t p = 0, q; p < l.size() && e.empty(); p = q + 1) {
        q = l.find('\n', p);
        if (q == string::npos) q = l.size();
        string t = l.substr(p, q - p);
        if (!t.empty() && t.back() == '\r') t.pop_back();
        string u = t;
        for (auto& ch : u) ch = ch == '\\' ? '/' : (char)tolower((uint8_t)ch);
        if (u == "fomod/moduleconfig.xml" || (u.size() > 23 && !u.compare(u.size() - 23, 23, "/fomod/moduleconfig.xml"))) e = t;
    }
    if (e.empty()) return false;
    if (x) {
        string b = tarout(d, L"-xOf \"" + n + L"\" \"" + W(e) + L"\"");
        if (b.size() >= 2 && (uint8_t)b[0] == 0xFF && (uint8_t)b[1] == 0xFE) x->assign((const wchar_t*)b.data() + 1, (b.size() - 2) / 2);
        else *x = W(b.rfind("\xEF\xBB\xBF", 0) ? b : b.substr(3));
    }
    return true;
}

static wstring xn(wstring s) {
    static const pair<const wchar_t*, const wchar_t*> e[] = {{L"&lt;", L"<"}, {L"&gt;", L">"}, {L"&quot;", L"\""}, {L"&apos;", L"'"}, {L"&amp;", L"&"}};
    for (auto& [a, b] : e) for (size_t p = 0; (p = s.find(a, p)) != wstring::npos; p++) s.replace(p, wcslen(a), b);
    size_t a = s.find_first_not_of(L" \t\r\n"), b = s.find_last_not_of(L" \t\r\n");
    return a == wstring::npos ? L"" : lc(s.substr(a, b - a + 1));
}

// launcher replays by plugin name across all groups, a name shared with another group breaks the choice
static bool fsafe(const wstring& x, J& ic, wstring& mn) {
    struct G { wstring k; size_t at; vector<wstring> pl; };
    vector<G> gs;
    wstring st;
    if (size_t a = x.find(L"<moduleName"); a != wstring::npos && (a = x.find(L'>', a)) != wstring::npos) mn = x.substr(a + 1, x.find(L'<', a) - a - 1);
    for (size_t p = 0; (p = x.find(L'<', p)) != wstring::npos; p++) {
        int t = 0;
        for (auto [w, n] : {pair<const wchar_t*, int>{L"installStep", 1}, {L"group", 2}, {L"plugin", 3}})
            if (size_t l = wcslen(w); !x.compare(p + 1, l, w) && p + 1 + l < x.size() && iswspace(x[p + 1 + l])) t = n;
        size_t e = x.find(L'>', p), a = x.find(L"name=", p);
        if (!t || e == wstring::npos || a == wstring::npos || a > e || a + 5 >= x.size()) continue;
        wchar_t q = x[a + 5];
        wstring v = xn(x.substr(a + 6, x.find(q, a + 6) - a - 6));
        if (t == 1) st = v;
        else if (t == 2) gs.push_back({st + L"|" + v, p, {}});
        else if (!gs.empty()) gs.back().pl.push_back(v);
    }
    unordered_map<wstring, unordered_set<wstring>> ex;
    unordered_set<wstring> S, seen;
    J* op = ic.at("options");
    if (!op || op->t != J::ARR) return false;
    for (auto& o : op->v) {
        J *sn = o.at("name"), *gv = o.at("groups");
        if (!sn || !gv) return false;
        for (auto& g : gv->v) {
            J *gn = g.at("name"), *cv = g.at("choices");
            if (!gn || !cv) return false;
            auto& e = ex[xn(W(sn->s)) + L"|" + xn(W(gn->s))];
            for (auto& c : cv->v) if (J* n = c.at("name")) e.insert(xn(W(n->s))), S.insert(xn(W(n->s)));
        }
    }
    if (S.empty()) return false;
    for (size_t i = 0; i < gs.size(); i++) {
        unordered_set<wstring> mt;
        for (auto& n : gs[i].pl) if (S.count(n)) mt.insert(n);
        auto it = ex.find(gs[i].k);
        if (it != ex.end()) seen.insert(gs[i].k);
        if (mt != (it == ex.end() ? unordered_set<wstring>() : it->second)) return false;
        if (mt.empty() && it != ex.end()) {
            wstring b = x.substr(gs[i].at, (i + 1 < gs.size() ? gs[i + 1].at : x.size()) - gs[i].at);
            if (b.find(L"\"Recommended\"") != wstring::npos || b.find(L"\"Required\"") != wstring::npos) return false;
        }
    }
    return seen.size() == ex.size();
}

static void vmeta(M& m, J* mods, J* dls, const wstring& dl, size_t& miss) {
    J *e = mods->at(U(m.dir).c_str()), *a = e ? e->at("attributes") : 0;
    if (!a) { miss++; return; }
    auto g = [&](const char* k) { J* x = a->at(k); return x ? W(x->s) : wstring(); };
    long long id = _wtoi64(g("modId").c_str()), ts = _wtoi64(g("uploadedTimestamp").c_str());
    m.nid = lc(g("source")) == L"nexus" && lc(g("downloadGame")) == L"cyberpunk2077" && id > 0 ? id : 0;
    wstring v = g("version");
    while (!v.empty() && v.back() == L'.') v.pop_back();
    if (!v.empty()) m.ver = v;
    if (m.nid) {
        m.fid = _wtoi64(g("fileId").c_str()), m.fn = g("fileName");
        if (ts > 0) m.date = ymd(ts);
    } else m.url = g("homepage");
    m.auth = g("author").empty() ? g("uploader") : g("author");
    m.desc = g("shortDescription"), m.shown = g("customFileName"), m.pic = g("pictureUrl"), m.nex = g("modName");
    J* ic = a->at("installerChoices");
    J* op = ic ? ic->at("options") : 0;
    if (!op || op->t != J::ARR) return;
    string cj;
    for (auto& o : op->v) {
        J *sn = o.at("name"), *gv = o.at("groups");
        if (sn && gv) for (auto& gr : gv->v) {
            J *gn = gr.at("name"), *cv = gr.at("choices");
            if (gn && cv) for (auto& c : cv->v) {
                J *n = c.at("name"), *ix = c.at("idx");
                if (n) cj += (cj.empty() ? "{\"stepName\":" : ",{\"stepName\":") + js8(sn->s) + ",\"groupName\":" + js8(gn->s) + ",\"pluginId\":" + js8(ix ? ix->s : "") + ",\"pluginName\":" + js8(n->s) + "}";
            }
        }
    }
    if (cj.empty()) return;
    wstring x, mn;
    J *ar = e->at("archiveId"), *f = ar && dls ? dls->at(ar->s.c_str()) : 0, *lo = f ? f->at("localPath") : 0;
    bool ok = lo && fcfg(dl + L"\\cyberpunk2077\\" + W(lo->s), &x) && fsafe(x, *ic, mn);
    m.fj = "{\"moduleName\":" + js(mn.empty() ? m.name : mn) + ",\"installedAt\":" + js(g("installTime")) + ",\"choices\":[" + cj + "]}";
    m.frz = !ok;
}

static size_t nhid, nfold, njunk;
static void mfilt(vector<F>& v, bool ov) {
    static const wchar_t* const jk[] = {L"r6\\cache\\", L"r6\\logs\\", L"red4ext\\logs\\", L"logs\\"};
    unordered_set<wstring> seen;
    size_t j = 0;
    stable_partition(v.begin(), v.end(), [](const F& f) { return f.key.rfind(L"root\\", 0) != 0; });
    for (auto& f : v) {
        if (!f.key.rfind(L"root\\", 0)) f.key.erase(0, 5), f.rel.erase(0, 5), f.up = true, nfold++;
        if (ends(f.key, L".mohidden")) { nhid++; continue; }
        bool x = f.key == L"meta.ini" || f.key == L"readme.txt" || !f.key.rfind(L"fomod\\", 0) || !f.key.rfind(L".git\\", 0) || f.key.find(L"\\.git\\") != wstring::npos || f.key == L"archive\\pc\\mod\\modlist.txt";
        if (ov) {
            x = x || ends(f.key, L".log") || ends(f.key, L".dmp");
            for (auto p : jk) x = x || !f.key.rfind(p, 0);
            njunk += x;
        }
        if (x || !seen.insert(f.key).second) continue;
        if (&v[j] != &f) v[j] = move(f);
        j++;
    }
    v.resize(j);
}

struct MI { wstring dir, mods, over, dl, pd, prof, game; vector<pair<wstring, wchar_t>> l; bool ord = false, saves = false, ui = false; };
static MI miread(wstring d, const wstring& pn) {
    wchar_t la[MAX_PATH] = L"";
    GetEnvironmentVariableW(L"LOCALAPPDATA", la, MAX_PATH);
    if (*la && !exists(d + L"\\ModOrganizer.ini") && exists(wstring(la) + L"\\ModOrganizer\\" + d + L"\\ModOrganizer.ini")) d = wstring(la) + L"\\ModOrganizer\\" + d;
    d = lp(d);
    if (!exists(d + L"\\ModOrganizer.ini")) throw Err{L"нет ModOrganizer.ini: " + disp(d)};
    auto q = qini(d + L"\\ModOrganizer.ini");
    auto g = [&](const char* k) { auto it = q.find(k); return it == q.end() ? wstring() : it->second; };
    if (lc(g("general/gamename")) != L"cyberpunk 2077") throw Err{L"этот экземпляр MO2 не для Cyberpunk 2077: " + g("general/gamename")};
    wstring base = g("settings/base_directory");
    replace(base.begin(), base.end(), L'/', L'\\');
    base = base.empty() ? d : lp(base);
    auto pth = [&](const char* k, const wchar_t* df) {
        wstring v = g(k);
        if (v.empty()) v = wstring(L"%BASE_DIR%/") + df;
        if (size_t p = v.find(L"%BASE_DIR%"); p != wstring::npos) v.replace(p, 10, base);
        replace(v.begin(), v.end(), L'/', L'\\');
        return lp(v.size() > 1 && (v[1] == L':' || v[0] == L'\\') ? v : base + L"\\" + v);
    };
    MI r;
    r.dir = d, r.mods = pth("settings/mod_directory", L"mods"), r.over = pth("settings/overwrite_directory", L"overwrite"), r.dl = pth("settings/download_directory", L"downloads"), r.game = g("general/gamepath");
    r.prof = pn.empty() ? g("general/selected_profile") : pn;
    if (r.prof.empty()) r.prof = L"Default";
    wstring ps = pth("settings/profiles_directory", L"profiles");
    r.pd = ps + L"\\" + r.prof;
    if (!exists(r.pd + L"\\modlist.txt")) {
        wstring ls;
        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileExW((ps + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, 0);
        if (h != INVALID_HANDLE_VALUE) {
            do if (wstring n = fd.cFileName; n != L"." && n != L".." && exists(ps + L"\\" + n + L"\\modlist.txt")) ls += (ls.empty() ? L"" : L", ") + n;
            while (FindNextFileW(h, &fd));
            FindClose(h);
        }
        throw Err{L"нет профиля " + r.prof + L" в MO2, есть: " + ls};
    }
    r.l = mlist(slurp(r.pd + L"\\modlist.txt"));
    for (auto& [k, v] : q) r.ord = r.ord || (!k.rfind("plugins/", 0) && ends(W(k), L"enforce_archive_load_order") && lc(v) == L"true");
    if (exists(r.pd + L"\\settings.ini")) {
        auto s = qini(r.pd + L"\\settings.ini");
        auto it = s.find("general/localsaves");
        r.saves = it != s.end() && lc(it->second) == L"true" && exists(r.pd + L"\\saves");
    }
    r.ui = exists(r.pd + L"\\UserSettings.json");
    return r;
}

static int run(const wstring& ga, const wstring& oa, bool apply, int pol, wstring title, bool chk, const vector<wstring>& xt, const wstring& inst, const wstring& pfl) {
    MI mq;
    if (mo2) mq = miread(inst, pfl);
    const wstring snm = mo2 ? L"MO2" : L"Vortex";
    wstring game = lp(ga.empty() ? mq.game : ga), out = lp(oa), parent = out.substr(0, out.rfind(L'\\')), leaf = out.substr(out.rfind(L'\\') + 1);
    if (!regex_match(leaf, wregex(L"[A-Za-z0-9_-]+"))) throw Err{L"имя папки сборки: только латиница, цифры, _ и -"};
    bool mg = exists(out);
    if (mg && !exists(out + L"\\_build_info.json") && !exists(out + L"\\_profiles.json") && !exists(out + L"\\_activation_state.json"))
        throw Err{L"папка есть, но это не сборка exlauncher: " + disp(out)};
    if (mo2 && !exists(game + L"\\bin\\x64\\Cyberpunk2077.exe")) throw Err{L"не найдена игра, проверь путь в MO2 или укажи папку игры: " + disp(game)};
    if (title.empty()) title = leaf;
    jbd = disp(out);
    ph("read", mo2 ? L"читаю профиль MO2 и сборку" : L"читаю манифест vortex и сборку");

    wstring stg;
    unordered_map<wstring, wstring> win;
    unordered_set<wstring> dep;
    unordered_map<wstring, int> pri;
    vector<pair<int, wstring>> sps;
    static const wregex rsep(L".*_separator"), rbak(L".*backup[0-9]*");
    J vst;
    J *vmods = 0, *vdls = 0;
    wstring vdl;
    size_t vmiss = 0;
    if (mo2) {
        stg = mq.mods;
        int n = (int)mq.l.size();
        for (int i = n - 1; i >= 0; i--) {
            auto& [s, p] = mq.l[i];
            pri[lc(s)] = n - i;
            if (regex_match(s, rsep)) sps.push_back({n - i, s.substr(0, s.size() - 10)});
            else if (p != L'-' && p != L'*' && !regex_match(s, rbak)) dep.insert(lc(s));
        }
    } else {
        J man = pj(slurp(game + L"\\vortex.deployment.json"));
        J *sp = man.at("stagingPath"), *fs = man.at("files");
        if (!sp || !fs || fs->t != J::ARR) throw Err{L"в vortex.deployment.json нет stagingPath/files"};
        stg = lp(W(sp->s));
        for (auto& x : fs->v) {
            J *rp = x.at("relPath"), *src = x.at("source"), *tg = x.at("target");
            if (!rp || !src) throw Err{L"запись манифеста без relPath/source"};
            if (tg && !tg->s.empty()) throw Err{L"target=\"" + W(tg->s) + L"\" в манифесте, такую раскладку не знаю"};
            wstring r = W(rp->s), s = lc(W(src->s));
            replace(r.begin(), r.end(), L'/', L'\\');
            win[lc(r)] = s;
            dep.insert(s);
        }
        wchar_t ad[MAX_PATH] = L"";
        GetEnvironmentVariableW(L"APPDATA", ad, MAX_PATH);
        wstring vh = wstring(ad) + L"\\Vortex", bd = vh + L"\\temp\\state_backups_full", bs;
        WIN32_FIND_DATAW fd;
        FILETIME bt{};
        HANDLE h = FindFirstFileExW((bd + L"\\*.json").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, 0);
        if (h != INVALID_HANDLE_VALUE) {
            do if (CompareFileTime(&fd.ftLastWriteTime, &bt) > 0) bt = fd.ftLastWriteTime, bs = fd.cFileName;
            while (FindNextFileW(h, &fd));
            FindClose(h);
        }
        try { if (!bs.empty()) vst = pj(slurp(bd + L"\\" + bs)); } catch (Err&) {}
        J* pe = vst.t == J::OBJ ? vst.at("persistent") : 0;
        J* mo = pe ? pe->at("mods") : 0;
        vmods = mo ? mo->at("cyberpunk2077") : 0;
        J* dn = pe ? pe->at("downloads") : 0;
        vdls = dn ? dn->at("files") : 0;
        J *se = vst.t == J::OBJ ? vst.at("settings") : 0, *ds = se ? se->at("downloads") : 0, *dp = ds ? ds->at("path") : 0;
        vdl = dp ? W(dp->s) : L"{USERDATA}\\downloads";
        if (size_t p = vdl.find(L"{USERDATA}"); p != wstring::npos) vdl.replace(p, 10, vh);
        vdl = lp(vdl);
    }

    vector<M> ms;
    vector<wstring> lnk;
    J st, pr, bm;
    vector<J> ea;
    const wchar_t* jn[3] = {L"\\_activation_state.json", L"\\_profiles.json", L"\\_build_meta.json"};
    string raw[3];
    bool pmis = false;
    int nprof = 0;
    wstring aprof;
    if (mg) {
        for (int i = 0; i < 3; i++) if (exists(out + jn[i])) raw[i] = slurp(out + jn[i]);
        if (!raw[0].empty()) st = pj(raw[0]);
        if (!raw[1].empty()) pr = pj(raw[1]);
        if (!raw[2].empty()) bm = pj(raw[2]);
        J *cur = 0, *pa = 0, *a = st.t == J::OBJ ? st.at("activations") : 0;
        if (pr.t == J::OBJ && pr.at("profiles") && pr.at("activeProfile")) {
            nprof = (int)pr.at("profiles")->v.size(), aprof = W(pr.at("activeProfile")->s);
            cur = pr.at("profiles")->at(pr.at("activeProfile")->s.c_str());
            pa = cur ? cur->at("activations") : 0;
        }
        if (!a) a = pa;
        if (a && pa && a != pa) {
            auto sig = [](vector<J> x) {
                string s;
                for (auto& e : x) {
                    J *c = e.at("categoryName"), *d = e.at("folderName"), *n = e.at("enabled");
                    s += (c ? c->s : "") + '/' + (d ? d->s : "") + '/' + (n ? n->t == J::BOOL ? n->b ? "1" : "0" : n->s : "") + '\n';
                }
                return s;
            };
            pmis = sig(byord(a->v)) != sig(byord(pa->v));
        }
        if (a && a->t == J::ARR) ea = byord(a->v);
        for (int i = 0; i < (int)ea.size(); i++) {
            J *c = ea[i].at("categoryName"), *d = ea[i].at("folderName"), *en = ea[i].at("enabled");
            if (!c || !d) throw Err{L"в состоянии сборки запись без categoryName/folderName"};
            M m;
            m.ex = true, m.ei = i, m.cat = W(c->s), m.dir = W(d->s), m.lid = lc(m.dir), m.name = m.dir;
            m.on = en && (en->t == J::BOOL ? en->b : en->s == "1" || !_stricmp(en->s.c_str(), "true"));
            m.root = out + L"\\" + m.cat + L"\\" + m.dir;
            if (exists(m.root + L"\\_mod_meta.json")) {
                J mm = pj(slurp(m.root + L"\\_mod_meta.json"));
                if (J* o = mm.at("originalName")) m.orig = W(o->s);
                if (J* o = mm.at("nexusModId")) m.nid = _atoi64(o->s.c_str());
                if (J* o = mm.at("displayName"); o && !o->s.empty()) m.name = W(o->s);
                if (J* o = mm.at("version")) m.ver = W(o->s);
                if (J* o = mm.at("description")) m.desc = W(o->s);
                if (J* o = mm.at("nexusFileUploadedAt"); o && !o->s.empty()) m.date = W(o->s.substr(0, 10));
                else if (J* o2 = mm.at("installedAt")) m.date = W(o2->s.substr(0, 10));
                if (J* o = mm.at("addons"); o && o->t == J::ARR)
                    for (auto& ad : (m.aj = *o).v) {
                        J *t = ad.at("type"), *dn = ad.at("displayName"), *rf = ad.at("replacedFiles");
                        m.add.push_back((t && t->s == "translation" ? L"русификатор " : L"") + (dn ? W(dn->s) : L"?") +
                                        (rf && rf->t == J::ARR && rf->v.size() ? L", заменяет файлов: " + to_wstring(rf->v.size()) : L""));
                    }
            }
            vector<wstring> sk;
            if (exists(m.root)) walk(m.root, L"", m.f, sk, true);
            ms.push_back(move(m));
        }
    }
    int ne = (int)ms.size();

    WIN32_FIND_DATAW fd;
    size_t nsc = 0;
    ph("scan", mo2 ? L"сканирую моды MO2" : L"сканирую моды vortex");
    for (size_t ri = 0; ri <= xt.size(); ri++) {
        wstring rt = ri ? lp(xt[ri - 1]) : stg;
        HANDLE h = FindFirstFileExW((rt + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, 0);
        if (h == INVALID_HANDLE_VALUE) throw Err{L"нет папки модов: " + disp(rt)};
        do {
            wstring n = fd.cFileName;
            if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) || n == L"." || n == L".." || (!mo2 && !n.rfind(L"__", 0))) continue;
            if (mo2 && !ri && ((fd.dwFileAttributes & FILE_ATTRIBUTE_HIDDEN) || regex_match(n, rsep) || regex_match(n, rbak))) continue;
            prog("scan", ++nsc, 0, n);
            M m;
            m.dir = n, m.lid = lc(n), m.on = ri || dep.count(m.lid) > 0, m.root = rt + L"\\" + n;
            nm(m);
            vector<wstring> sk;
            walk(m.root, L"", m.f, sk, false);
            if (mo2 && !ri) {
                if (m.lid == L"disable crashreporter (mo cet fix)") { dep.erase(m.lid); continue; }
                auto it = pri.find(m.lid);
                m.pri = it == pri.end() ? 0 : it->second;
                mmeta(m);
                if (m.nid) m.frz = any_of(m.f.begin(), m.f.end(), [](const F& f) { return !f.key.rfind(L"fomod\\", 0); }) || (!m.fn.empty() && fcfg(mq.dl + L"\\" + m.fn, 0));
                mfilt(m.f, false);
                if (m.f.empty()) dep.erase(m.lid);
                if (m.dir[0] == L'_') m.dir = L"m" + m.dir;
            } else if (mo2) m.pri = INT_MAX / 2;
            else if (!ri && vmods) vmeta(m, vmods, vdls, vdl, vmiss);
            wstring dv;
            int nk = 0;
            for (auto& f : m.f)
                if (!f.key.rfind(L"red4ext\\plugins\\", 0) && ends(f.key, L".dll") && count(f.key.begin(), f.key.end(), L'\\') == 3) nk++, dv = dllver(fsp(m, f));
            if (nk == 1 && !dv.empty() && vcmp(dv, m.ver) > 0) m.ver = dv;
            for (auto& s : sk) lnk.push_back(n + L"\\" + s);
            if (!m.f.empty()) ms.push_back(move(m));
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }

    size_t nov = 0;
    if (mo2) {
        M m;
        m.dir = m.name = L"MO2 Overwrite", m.lid = lc(m.dir), m.on = true, m.root = mq.over, m.pri = INT_MAX;
        vector<wstring> sk;
        if (exists(m.root)) walk(m.root, L"", m.f, sk, false);
        mfilt(m.f, true);
        nov = m.f.size();
        if (nov) dep.insert(m.lid), ms.push_back(move(m));
        stable_sort(ms.begin() + ne, ms.end(), [](const M& a, const M& b) { return a.pri < b.pri; });
    }

    wstring cat = snm;
    for (int i = 2; mg && exists(out + L"\\" + cat); i++) cat = snm + (mo2 ? L"-" : L"") + to_wstring(i);
    unordered_map<wstring, int> mi;
    for (int i = ne; i < (int)ms.size(); i++) ms[i].cat = cat, mi[ms[i].lid] = i;
    if (mo2) for (int i = ne; i < (int)ms.size(); i++) if (ms[i].on) for (auto& f : ms[i].f) win[f.key] = ms[i].lid;
    vector<wstring> gone, col;
    for (auto& s : dep) if (!mi.count(s)) gone.push_back(s);
    for (int i = ne; i < (int)ms.size(); i++)
        for (auto& f : ms[i].f)
            for (size_t a = 0, b; a <= f.key.size(); a = b + 1) {
                b = f.key.find(L'\\', a);
                if (b == wstring::npos) b = f.key.size();
                if (svc.count(f.key.substr(a, b - a))) { col.push_back(ms[i].dir + L"\\" + f.rel); break; }
            }

    unordered_map<wstring, vector<pair<int, int>>> own;
    for (int i = 0; i < (int)ms.size(); i++)
        for (int j = 0; j < (int)ms[i].f.size(); j++) own[ms[i].f[j].key].push_back({i, j});
    auto hc = [&](int m, int j) {
        F& f = ms[m].f[j];
        if (!f.hashed && !(f.hashed = fcrc(fsp(ms[m], f), f.c, f.sz))) throw Err{L"не прочитать " + disp(ms[m].root + L"\\" + f.rel)};
        return f.c;
    };
    unordered_set<long long> dp;
    auto xconf = [&] {
        vector<X> r;
        for (auto& [key, ow] : own) {
            if (ends(key, L".log")) continue;
            int em = -1, ef = -1;
            for (auto [m, j] : ow) if (ms[m].ex && ms[m].on && (em < 0 || ms[m].ei > ms[em].ei)) em = m, ef = j;
            if (em < 0) continue;
            vector<pair<int, int>> vc;
            for (auto [m, j] : ow) if (!ms[m].ex && ms[m].on && !ms[m].skip) vc.push_back({m, j});
            auto w = win.find(key);
            if (w != win.end()) {
                auto it = find_if(vc.begin(), vc.end(), [&](auto& x) { return ms[x.first].lid == w->second; });
                if (it != vc.end()) vc = {*it};
            }
            for (auto [m, j] : vc)
                if (!dp.count((long long)em << 32 | m) && (hc(m, j) != hc(em, ef) || ms[m].f[j].sz != ms[em].f[ef].sz)) r.push_back({em, m, ef, j});
        }
        sort(r.begin(), r.end(), [&](const X& a, const X& b) {
            return a.em != b.em ? ms[a.em].ei < ms[b.em].ei : a.vm != b.vm ? a.vm < b.vm : ms[a.vm].f[a.vf].key < ms[b.vm].f[b.vf].key;
        });
        return r;
    };

    vector<D> dups;
    ph("compare", L"сравниваю со сборкой");
    {
        vector<unordered_map<wstring, int>> ks(ne);
        for (int i = 0; i < ne; i++) for (int j = 0; j < (int)ms[i].f.size(); j++) ks[i][ms[i].f[j].key] = j;
        for (int a = ne; a < (int)ms.size(); a++) {
            prog("compare", (size_t)(a - ne + 1), ms.size() - ne, ms[a].name);
            if (!ms[a].on) continue;
            for (int b = 0; b < ne; b++) {
                if (!ms[b].on) continue;
                size_t n = 0, na = 0, nb = 0;
                for (auto& f : ms[a].f) if (!ends(f.key, L".log")) na++, n += ks[b].count(f.key);
                for (auto& f : ms[b].f) nb += !ends(f.key, L".log");
                bool byname = ms[a].lid == ms[b].lid || ms[a].lid == lc(ms[b].orig);
                if (!byname && !(ms[a].nid && ms[a].nid == ms[b].nid && n * 2 >= max(na, nb))) continue;
                bool same = n == na && n == nb;
                for (int j = 0; same && j < (int)ms[a].f.size(); j++) {
                    if (ends(ms[a].f[j].key, L".log")) continue;
                    int bj = ks[b][ms[a].f[j].key];
                    same = hc(a, j) == hc(b, bj) && ms[a].f[j].sz == ms[b].f[bj].sz;
                }
                dups.push_back({a, b, n, same});
                break;
            }
        }
    }

    auto core = [&](const M& e, const M& v) {
        static const wregex rc(L"red4ext|cyber engine tweaks|\\bcet\\b|redscript|archivexl|tweakxl|codeware|input.?loader|mod.?settings|native.?settings");
        return !_wcsicmp(e.cat.c_str(), L"CORE") || regex_search(lc(e.name + L" " + v.name + L" " + e.dir + L" " + v.dir), rc);
    };
    auto onemod = [&](const M& e, const M& v) {
        return (e.nid && e.nid == v.nid) || (!e.name.empty() && !v.lid.rfind(lc(e.name), 0)) || (!v.name.empty() && !e.lid.rfind(lc(v.name), 0));
    };
    auto sm = [&](const M& e, const M& v) { int nw = newer(e, v); return nw > 0 || (!nw && !e.add.empty()) ? 1 : 2; };
    auto tip = [&](const M& e, const M& v) -> wstring {
        int nw = newer(e, v);
        if (nw > 0) return L"советую 1: в сборке новее";
        if (nw < 0) return L"советую 2: в вортексе новее";
        if (!e.add.empty()) return L"советую 1: в сборке есть дополнения";
        return L"советую 1: версии не различаются, сборка подобрана под себя";
    };
    struct DS { int eq = 0, ov = 0; size_t oa = 0; vector<tuple<wstring, uint64_t, uint64_t>> df; };
    auto dstat = [&](const D& d) {
        M &v = ms[d.v], &e = ms[d.e];
        unordered_map<wstring, int> ek;
        for (int j = 0; j < (int)e.f.size(); j++) if (!ends(e.f[j].key, L".log")) ek[e.f[j].key] = j;
        DS s;
        for (int j = 0; j < (int)v.f.size(); j++) {
            if (ends(v.f[j].key, L".log")) continue;
            auto it = ek.find(v.f[j].key);
            if (it == ek.end()) { s.ov++; continue; }
            if (hc(d.v, j) == hc(d.e, it->second) && v.f[j].sz == e.f[it->second].sz) s.eq++;
            else s.df.push_back({v.f[j].rel, e.f[it->second].sz, v.f[j].sz});
            ek.erase(it);
        }
        s.oa = ek.size();
        return s;
    };
    auto ddesc = [&](const D& d) {
        M &v = ms[d.v], &e = ms[d.e];
        DS s = dstat(d);
        int nw = newer(e, v);
        wstring r = e.name + (e.desc.empty() ? L"" : L" (" + e.desc + L")") + L"\n";
        r += L"    сборка:  " + vd(e) + (nw > 0 ? L"  <- новее" : L"") + L"   [" + e.cat + L"\\" + e.dir + L"]\n";
        r += L"    вортекс: " + vd(v) + (nw < 0 ? L"  <- новее" : L"") + L"   [" + v.dir + L"]\n";
        r += L"    файлы: одинаковых " + to_wstring(s.eq) + L", отличаются " + to_wstring(s.df.size()) + L", только в сборке " + to_wstring(s.oa) + L", только в вортексе " + to_wstring(s.ov) + L"\n";
        for (size_t i = 0; i < s.df.size() && i < 5; i++) r += L"      ~ " + get<0>(s.df[i]) + L"   сборка " + hs(get<1>(s.df[i])) + L" / вортекс " + hs(get<2>(s.df[i])) + L"\n";
        if (s.df.size() > 5) r += L"      ... и ещё " + to_wstring(s.df.size() - 5) + L"\n";
        for (auto& a : e.add) r += L"    в сборке дополнение: " + a + L"\n";
        if (d.lock) return r + L"    это ядро сборки, от него зависят другие моды: остаётся версия сборки, выбора нет\n";
        r += L"    1 оставить сборку: в игре " + vd(e) + L"\n";
        r += L"    2 взять вортекс: в игре " + vd(v) + L", мод сборки выключится (не удалится)";
        if (s.oa) r += L", пропадут " + to_wstring(s.oa) + L" файлов, которых нет в вортексе";
        if (!e.add.empty()) r += L", пропадут дополнения";
        return r + L"\n    " + tip(e, v) + L"\n";
    };

    int nd = 0;
    for (auto& d : dups)
        if (d.same) ms[d.v].skip = true;
        else d.lock = core(ms[d.e], ms[d.v]), nd += !d.lock, dp.insert((long long)d.e << 32 | d.v);
    vector<X> xs = xconf();
    size_t np = 0;
    for (size_t z = 0; z < xs.size(); z++) np += (!z || xs[z].em != xs[z - 1].em || xs[z].vm != xs[z - 1].vm) && !core(ms[xs[z].em], ms[xs[z].vm]);
    auto arc = [](const F& f) { return !f.drop && !f.key.rfind(L"archive\\pc\\mod\\", 0) && ends(f.key, L".archive") && f.key.find(L'\\', 15) == wstring::npos; };
    unordered_map<uint64_t, pair<int, int>> bh;
    unordered_set<wstring> bn;
    vector<tuple<int, int, vector<uint64_t>>> vh;
    ph("archives", L"читаю архивы");
    for (int m = 0; m < (int)ms.size(); m++) {
        prog("archives", (size_t)m + 1, ms.size(), ms[m].name);
        if (!ms[m].on || ms[m].skip) continue;
        for (int j = 0; j < (int)ms[m].f.size(); j++) {
            F& f = ms[m].f[j];
            if (!arc(f)) continue;
            vector<uint64_t> hv = rdar(fsp(ms[m], f));
            if (!ms[m].ex) { vh.push_back({m, j, move(hv)}); continue; }
            bn.insert(f.key);
            for (uint64_t x : hv) {
                auto [it, ok] = bh.try_emplace(x, m, j);
                if (!ok && wcscmp(f.rel.c_str() + 15, ms[it->second.first].f[it->second.second].rel.c_str() + 15) < 0) it->second = {m, j};
            }
        }
    }
    unordered_map<int, size_t> shd;
    auto apairs = [&] {
        map<pair<int, int>, A> r;
        shd.clear();
        for (auto& [v, j, hv] : vh) {
            if (!ms[v].on || ms[v].skip || bn.count(ms[v].f[j].key)) continue;
            for (uint64_t x : hv) {
                auto it = bh.find(x);
                if (it == bh.end() || !ms[it->second.first].on) continue;
                auto [e, ej] = it->second;
                if (wcscmp(ms[v].f[j].rel.c_str() + 15, ms[e].f[ej].rel.c_str() + 15) > 0) { shd[v]++; continue; }
                A& a = r[{e, v}];
                if (!a.n++) a.e = e, a.v = v, a.ea = ms[e].f[ej].rel.substr(15), a.va = ms[v].f[j].rel.substr(15);
            }
        }
        return r;
    };
    size_t na = 0;
    for (auto& [k, a] : apairs()) na += !core(ms[a.e], ms[a.v]) && !dp.count((long long)a.e << 32 | a.v);
    if (mo2 && mq.ord) {
        unordered_map<uint64_t, int> ow;
        map<pair<int, int>, int> ap;
        for (auto& [v, j, hv] : vh) {
            if (!ms[v].on || ms[v].skip) continue;
            for (uint64_t x : hv) if (auto [it, ok] = ow.try_emplace(x, v); !ok && it->second != v) ap[minmax(it->second, v)]++;
        }
        if (!ap.empty()) wn(L"в MO2 включён свой порядок архивов, лаунчер грузит их по имени: у " + to_wstring(ap.size()) + L" пар модов может смениться победитель, проверь карту конфликтов");
    }
    int g = pol;
    if (apply && mg && !g && (nd || np || na)) {
        wprintf(L"\nмодов, которые есть и в сборке, и в вортексе: %d\nпар модов, которые спорят за одни файлы: %zu\nпар модов, у которых архивы спорят за ресурсы игры: %zu\nядро сборки не трогаю, там всегда остаётся версия сборки\n", nd, np, na);
        g = pick(L"  1 везде оставить то, что в сборке\n  2 везде поставить из вортекса (моды сборки выключатся, не удалятся)\n  3 решить по каждому: покажу версии и чем отличаются файлы\n  4 вортекс главнее, но более новые версии и русификаторы сборки сохраняются, архивы обоих модов остаются включены", 4);
    }
    if (mg && !g && !nd && !np && !na) g = 1;
    auto did = [&](const wchar_t* w, int e, int v) { return w + (L":" + lc(ms[e].cat + L"/" + ms[e].dir)) + L"|" + ms[v].lid; };
    auto dno = [&](const D& d) { return d.lock || (d.same && !_wcsnicmp(ms[d.e].cat.c_str(), snm.c_str(), snm.size()) && lc(ms[d.e].orig) == ms[d.v].lid) ? 1 : 2; };
    auto pno = [&](int e, int v) { return core(ms[e], ms[v]) ? 1 : onemod(ms[e], ms[v]) ? 2 : 3; };
    int di = 0;
    for (auto& d : dups) {
        if (!g) continue;
        d.c0 = d.same ? g == 1 || g == 4 || dno(d) < 2 ? 1 : 2 : d.lock ? 1 : g == 4 ? sm(ms[d.e], ms[d.v]) : g < 3 ? g : 0;
        int c = dget(did(L"dup", d.e, d.v), dno(d), okd);
        if (!c) c = d.c0 ? d.c0 : pick(L"\n[" + to_wstring(++di) + L"/" + to_wstring(nd) + L"] " + ddesc(d), 2);
        if ((d.c = c) == 1) ms[d.v].skip = true;
        else ms[d.v].skip = false, ms[d.e].on = false, ms[d.e].off = true;
    }

    vector<E> es;
    int same = 0, stale = 0;
    for (auto& [key, w] : win) {
        auto it = own.find(key);
        auto wm = mi.find(w);
        int wi = wm == mi.end() ? -1 : wm->second, wj = -1;
        if (it != own.end() && wi >= 0) for (auto [m, j] : it->second) if (m == wi) wj = j;
        if (wj < 0) { stale++; continue; }
        if (!ms[wi].on || ms[wi].skip) continue;
        for (auto [m, j] : it->second) {
            if (m == wi || ms[m].ex || !ms[m].on || ms[m].skip) continue;
            if (hc(m, j) == hc(wi, wj) && ms[m].f[j].sz == ms[wi].f[wj].sz) { same++; continue; }
            es.push_back({m, wi, j});
        }
    }
    sort(es.begin(), es.end(), [&](const E& a, const E& b) { return ms[a.from].f[a.fi].key < ms[b.from].f[b.fi].key; });
    size_t nvv = es.size();
    int cut = 0;
    vector<int> vbad;
    size_t tot = 0, done = 0, nh = 0;
    auto sum = [&](bool dc) {
        int on = 0, off = 0, sk = 0, dis = 0;
        for (int i = 0; i < (int)ms.size(); i++)
            if (i < ne) dis += ms[i].off;
            else if (ms[i].skip) sk++;
            else if (ms[i].on) on++;
            else off++;
        O("summary").b("decided", dc).n("mods", on + off + sk).n("on", on).n("off", off).n("skip", sk).n("exl", ne).n("disabled", dis).n("dups", nd).n("pairs", np).n("archives", na)
            .n("vconf", nvv).n("same", same).n("stale", stale).n("cut", cut).n("broken", vbad.size()).n("files", done).n("links", nh).n("copies", done - nh).go();
    };

    auto pdesc = [&](size_t i, size_t k) {
        M &e = ms[xs[i].em], &v = ms[xs[i].vm];
        int nw = newer(e, v);
        wstring r = L"спорят за файлы: " + e.name + L"  <->  " + v.name + L"\n";
        r += L"    сборка:  " + vd(e) + (nw > 0 ? L"  <- новее" : L"") + L"   [" + e.cat + L"\\" + e.dir + L"]\n";
        r += L"    вортекс: " + vd(v) + (nw < 0 ? L"  <- новее" : L"") + L"   [" + v.dir + L"]\n";
        r += L"    отличаются " + to_wstring(k - i) + L":\n";
        for (size_t z = i; z < k && z < i + 6; z++) r += L"      ~ " + v.f[xs[z].vf].rel + L"   сборка " + hs(e.f[xs[z].ef].sz) + L" / вортекс " + hs(v.f[xs[z].vf].sz) + L"\n";
        if (k - i > 6) r += L"      ... и ещё " + to_wstring(k - i - 6) + L"\n";
        if (core(e, v)) return r + L"    это ядро сборки: остаются файлы сборки, выбора нет\n";
        r += L"    1 эти файлы из сборки, 2 из вортекса; остальные файлы обоих модов остаются\n";
        if (onemod(e, v)) r += L"    это один мод разных версий: только целиком, по файлам мешать нельзя\n";
        return r + L"    " + tip(e, v) + L"\n";
    };
    if (g) xs = xconf();
    vector<int> xc(xs.size()), pc(xs.size()), p0(xs.size());
    vector<pair<int, int>> rep;
    int pn = 0;
    for (size_t i = 0, k; i < xs.size(); i = k) {
        for (k = i; k < xs.size() && xs[k].em == xs[i].em && xs[k].vm == xs[i].vm; k++);
        if (!g) continue;
        M &pe = ms[xs[i].em], &pv = ms[xs[i].vm];
        bool one = onemod(pe, pv);
        wstring pid = did(L"files", xs[i].em, xs[i].vm);
        int c0 = core(pe, pv) ? 1 : g == 4 ? one ? sm(pe, pv) : 2 : g < 3 ? g : 0, c = dget(pid, pno(xs[i].em, xs[i].vm), okd);
        if (!c) c = c0 ? c0 : pick(L"\n[пара " + to_wstring(++pn) + L"] " + pdesc(i, k) + (one ? L"    1 сборка  2 вортекс" : L"    1 сборка  2 вортекс  3 по каждому файлу"), one ? 2 : 3);
        p0[i] = c0, pc[i] = c;
        bool id = (pe.nid && pe.nid == pv.nid) || (!pe.name.empty() && lc(pe.name) == lc(pv.name));
        if (id && c == 1 && pe.on) pv.on = false, pv.why = L"этот мод уже есть в сборке: " + pe.name + L" " + pe.ver;
        if (id && c == 2 && pv.on) pe.on = false, pe.off = true, rep.push_back({xs[i].em, xs[i].vm});
        for (size_t z = i; z < k; z++) {
            if (!(xc[z] = c < 3 ? c : dget(pid + L"|" + pv.f[xs[z].vf].key, 2, okd)))
                xc[z] = c0 ? c0 : pick(L"  " + pv.f[xs[z].vf].rel + L"   сборка " + hs(pe.f[xs[z].ef].sz) + L" / вортекс " + hs(pv.f[xs[z].vf].sz) + L"   1 сборка  2 вортекс", 2);
            if (xc[z] == 2) { es.push_back({xs[z].em, xs[z].vm, xs[z].ef}); continue; }
            for (auto [m, j] : own[ms[xs[z].vm].f[xs[z].vf].key]) if (!ms[m].ex && ms[m].on && !ms[m].skip) es.push_back({m, xs[z].em, j});
        }
    }
    vector<A> acs;
    int an = 0;
    for (auto& [k, a] : apairs()) {
        M &e = ms[a.e], &v = ms[a.v];
        if (!e.on || !v.on) continue;
        if (g) {
            int nw = newer(e, v);
            wstring q = L"\n[архивы " + to_wstring(++an) + L"] спорят за ресурсы игры: " + e.name + L"  <->  " + v.name + L"\n";
            q += L"    сборка:  " + vd(e) + (nw > 0 ? L"  <- новее" : L"") + L"   [" + e.cat + L"\\" + e.dir + L"], архив " + a.ea + L"\n";
            q += L"    вортекс: " + vd(v) + (nw < 0 ? L"  <- новее" : L"") + L"   [" + v.dir + L"], архив " + a.va + L"\n";
            q += L"    общих ресурсов " + to_wstring(a.n) + L", игра берёт ресурс из архива, который раньше по имени, сейчас это архив вортекса\n";
            q += L"    1 оставить сборку: мод вортекса перенесётся выключенным\n    2 взять вортекс: мод сборки выключится (не удалится)\n    3 оставить оба: общие ресурсы из вортекса, остальное у каждого своё\n    " + tip(e, v);
            a.c0 = core(e, v) ? 1 : g == 4 ? onemod(e, v) ? sm(e, v) : 3 : g < 3 ? g : 0;
            if (!(a.c = dget(did(L"archive", a.e, a.v), core(e, v) ? 1 : 3, oka))) a.c = a.c0 ? a.c0 : pick(q, 3);
            if (a.c == 1) v.on = false, v.why = L"архив перекрывает ресурсы мода сборки " + e.name;
            else if (a.c == 2) e.on = false, e.off = true;
        }
        acs.push_back(a);
    }
    if (g) for (size_t i = 0; i < du.size(); i++) if (!du[i]) wn(L"решение не использовано, такого конфликта нет: " + W(dec.k[i]));
    for (int i = 1; i < ne; i++) es.push_back({i - 1, i, -1});

    int von = 0, voff = 0, vskip = 0;
    for (int i = ne; i < (int)ms.size(); i++) ms[i].skip ? vskip++ : ms[i].on ? von++ : voff++;
    if (!mo2 && !vmods) wn(L"нет бэкапа базы vortex (temp\\state_backups_full), версии и nexus id взяты из имён папок");
    if (vmiss) wn(L"в базе vortex нет модов: " + to_wstring(vmiss) + L", их данные взяты из имён папок");
    {
        size_t fk = 0;
        vector<wstring> fz;
        for (int i = ne; i < (int)ms.size(); i++) {
            fk += !ms[i].fj.empty();
            if (ms[i].frz) fz.push_back(ms[i].name);
        }
        if (fk || !fz.empty()) wprintf(L"fomod: выборы перенесены %zu, обновления заморожены %zu\n", fk, fz.size());
        for (auto& n : fz) wprintf(L"  заморожен, лаунчер не повторит выбор при обновлении: %s\n", n.c_str());
        O("fomod").n("kept", fk).r("frozen", jarr(fz)).go();
    }
    if (mo2) {
        static const unordered_set<wstring> tops = {L"archive", L"bin", L"engine", L"mods", L"r6", L"red4ext", L"tools"};
        static const wregex rdoc(L".*\\.(txt|md|pdf|png|jpe?g|webp|gif|url|html?)");
        size_t on = 0, off = 0;
        for (int i = ne; i < (int)ms.size(); i++) {
            (ms[i].on ? on : off)++;
            if (ms[i].on && ms[i].pri != INT_MAX) for (auto& f : ms[i].f) if (!tops.count(f.key.substr(0, f.key.find(L'\\'))) && !regex_match(f.key, rdoc)) { wn(L"мод " + ms[i].name + L" лежит не от корня игры, в игре файл окажется не там: " + f.rel); break; }
        }
        wprintf(L"экземпляр MO2: %s, профиль %s\n", disp(mq.dir).c_str(), mq.prof.c_str());
        wprintf(L"модов %zu: вкл %zu, выкл %zu, разделителей %zu\n", on + off, on, off, sps.size());
        wprintf(L"overwrite: файлов %zu, отброшено логов и кэша %zu, скрытых .mohidden %zu, развёрнуто из root %zu\n", nov, njunk, nhid, nfold);
        O("mo2").s("instance", disp(mq.dir)).s("profile", mq.prof).s("game", disp(game)).n("mods", on + off).n("on", on).n("off", off).n("separators", sps.size()).n("overwrite", nov).n("junk", njunk).n("hidden", nhid).n("rootfold", nfold).go();
        if (mq.saves) wn(L"сейвы этого профиля лежат в " + disp(mq.pd) + L"\\saves, игра из лаунчера их не увидит, скопируй их в Saved Games сам");
        if (mq.ui) wn(L"у профиля свой UserSettings.json, настройки игры из него лаунчер не подхватит: " + disp(mq.pd));
    }
    wprintf(L"vortex: %s\n", disp(stg).c_str());
    wprintf(L"модов вортекса %d: вкл %d, выкл %d, пропущено %d\n", von + voff + vskip, von, voff, vskip);
    if (mg) wprintf(L"сборка экса: %s, модов %d, категория для переноса: %s\n", disp(out).c_str(), ne, cat.c_str());
    else wprintf(L"новая сборка: %s\n", disp(out).c_str());
    if (nprof > 1) wprintf(L"профилей %d, перенос попадёт только в активный: %s\n", nprof, aprof.c_str());
    O("target").a("source", mo2 ? "mo2" : "vortex").s("vortex", disp(stg)).s("build", disp(out)).b("merge", mg).n("exl", ne).s("category", cat).n("profiles", nprof).s("profile", aprof).go();
    if (pmis) wn(L"активный профиль не совпадает с _activation_state.json, --apply откажется");
    wprintf(L"конфликтов внутри вортекса %zu, одинаковых файлов %d\n", nvv, same);
    if (stale) wn(to_wstring(stale) + L" записей манифеста не сходятся с папкой модов, сделай deploy в vortex");
    for (auto& s : gone) wn((mo2 ? L"мод из modlist.txt не найден в папке модов: " : L"мод из манифеста не найден в папке модов: ") + s);
    for (auto& s : lnk) wn(L"ссылка пропущена: " + s);
    for (auto& s : col) wn(L"служебное имя exlauncher, не задеплоится: " + s);

    auto side = [&](int i) {
        M& m = ms[i];
        return O().s("name", m.name).s("dir", m.dir).s("cat", m.cat).s("ver", m.ver).s("date", m.date).n("nid", m.nid).s("desc", m.desc).r("addons", jarr(m.add)).str();
    };
    auto cn = [](int c, const char* const* nm) { return c ? js8(nm[c - 1]) : string("null"); };
    auto ops = [](int n, const char* const* nm) { string r = "["; for (int i = 0; i < n; i++) r += (i ? "," : "") + js8(nm[i]); return r + "]"; };
    auto cev = [&](const wstring& id, const char* kd, int e, int v, int c0, int c, int no, const char* const* nm) {
        int nw = newer(ms[e], ms[v]);
        return O("conflict").s("id", id).a("kind", kd).s("name", ms[e].name).r("a", side(e)).r("b", side(v)).r("default", cn(c0, nm)).r("choice", cn(c, nm)).r("options", ops(no, nm))
            .r("newer", nw > 0 ? "\"a\"" : nw < 0 ? "\"b\"" : "null").b("lock", no < 2).s("tip", tip(ms[e], ms[v]));
    };
    if (mg) {
        if (!dups.empty()) wprintf(L"\nмоды, которые есть и в сборке, и в вортексе:\n");
        for (auto& d : dups) {
            if (d.same) wprintf(L"  = %s: одинаковые%s\n", ms[d.e].name.c_str(), ms[d.e].off ? L", взята копия вортекса" : L", пропуск");
            else wprintf(L"\n  %s    итог: %s\n", ddesc(d).c_str(), ms[d.v].skip || d.lock ? L"остаётся сборка" : ms[d.e].off ? L"вортекс, мод сборки выключен" : L"спрошу при --apply");
            if (!jo) continue;
            DS s = dstat(d);
            string fl = "[";
            for (auto& [r, a, b] : s.df) fl += (fl.size() > 1 ? "," : "") + O().s("rel", r).n("a", a).n("b", b).str();
            cev(did(L"dup", d.e, d.v), "dup", d.e, d.v, d.c0, d.c, dno(d), okd).b("same", d.same).n("eq", s.eq).n("only_a", s.oa).n("only_b", s.ov).r("files", fl + "]").go();
        }
        for (size_t i = 0, k; i < xs.size(); i = k) {
            for (k = i; k < xs.size() && xs[k].em == xs[i].em && xs[k].vm == xs[i].vm; k++);
            wprintf(L"\n  %s", pdesc(i, k).c_str());
            if (g) for (size_t z = i; z < k; z++) wprintf(L"      %s: %s\n", ms[xs[z].vm].f[xs[z].vf].rel.c_str(), xc[z] == 1 ? L"сборка" : L"вортекс");
            if (!jo) continue;
            int e = xs[i].em, v = xs[i].vm;
            wstring pid = did(L"files", e, v);
            string fl = "[";
            for (size_t z = i; z < k; z++)
                fl += (z > i ? "," : "") + O().s("id", pid + L"|" + ms[v].f[xs[z].vf].key).s("rel", ms[v].f[xs[z].vf].rel).n("a", ms[e].f[xs[z].ef].sz).n("b", ms[v].f[xs[z].vf].sz).r("choice", cn(xc[z], okd)).str();
            cev(pid, "files", e, v, p0[i], pc[i], pno(e, v), okd).b("one", onemod(ms[e], ms[v])).r("files", fl + "]").go();
        }
        if (!acs.empty()) wprintf(L"\nархивы, которые спорят за ресурсы игры (берётся архив, который раньше по имени):\n");
        for (auto& a : acs) {
            wprintf(L"  %s [%s]  <->  %s [%s], общих %zu, итог: %s\n", ms[a.e].name.c_str(), a.ea.c_str(), ms[a.v].name.c_str(), a.va.c_str(), a.n,
                    a.c == 1 ? L"остаётся сборка, мод вортекса выключен" : a.c == 2 ? L"вортекс, мод сборки выключен" : a.c == 3 ? L"оба включены, общие ресурсы из вортекса" : L"спрошу при --apply");
            if (jo) cev(did(L"archive", a.e, a.v), "archive", a.e, a.v, a.c0, a.c, core(ms[a.e], ms[a.v]) ? 1 : 3, oka).n("shared", a.n).s("a_archive", a.ea).s("b_archive", a.va).go();
        }
        for (auto& [v, n] : shd)
            if (ms[v].on) {
                wprintf(L"  ~ %s: %zu ресурсов перекрыто архивами сборки, сборка не страдает, мод может работать не полностью\n", ms[v].name.c_str(), n);
                O("warn").s("msg", ms[v].name + L": " + to_wstring(n) + L" ресурсов перекрыто архивами сборки, сборка не страдает, мод может работать не полностью").go();
            }
        if (!g && (nd || !xs.empty() || na)) {
            wprintf(L"\nвыбор спрошу при --apply, или сразу --keep (оставить сборку) / --take (взять вортекс)\n");
            sum(false);
            return 0;
        }
    }

    auto o = order(ms, es);
    size_t need = 0;
    for (auto& m : ms) need += !m.skip;
    if (o.size() != need) throw Err{L"порядок не сошёлся"};
    for (auto& e : es) cut += e.cut;
    if (cut) wprintf(L"файлов вортекса выкинуто на циклах: %d\n", cut);
    while (chk) {
        wstring lib, tp(MAX_PATH, 0);
        for (int m : o)
            if (ms[m].on && !ms[m].skip)
                for (auto& f : ms[m].f) if (!f.drop && f.key == L"engine\\tools\\scc_lib.dll") lib = fsp(ms[m], f);
        wstring gc = game + L"\\r6\\cache\\final.redscripts";
        if (lib.empty() || !exists(gc)) { wprintf(L"\n"), wn(L"скрипты не проверить: нет " + (lib.empty() ? wstring(L"engine\\tools\\scc_lib.dll (redscript)") : disp(gc))); break; }
        ph("scc", L"проверяю скрипты");
        tp.resize(GetTempPathW(MAX_PATH, tp.data()));
        wstring t = lp(tp + L"vtx2exl_chk");
        rmtree(t);
        mkdirs(t + L"\\r6\\cache"), mkdirs(t + L"\\r6\\logs"), mkdirs(t + L"\\out");
        for (auto x : {L"final.redscripts", L"final.redscripts.bk"})
            if (exists(game + L"\\r6\\cache\\" + x) && !CopyFileW((game + L"\\r6\\cache\\" + x).c_str(), (t + L"\\r6\\cache\\" + x).c_str(), FALSE)) throw Err{L"не скопировать " + wstring(x)};
        unordered_map<wstring, int> who;
        size_t ncc = 0;
        auto cc = [&](const vector<int>& set, vector<Q>& er) {
            prog("scc", ++ncc, 0, L"");
            rmtree(t + L"\\r6\\scripts");
            who.clear();
            unordered_map<wstring, pair<int, int>> w;
            for (int m : set)
                for (int j = 0; j < (int)ms[m].f.size(); j++) {
                    F& f = ms[m].f[j];
                    if (f.drop || !ends(f.key, L".reds")) continue;
                    if (!f.key.rfind(L"r6\\scripts\\", 0)) w[f.key.substr(11)] = {m, j};
                    else if (!f.key.rfind(L"red4ext\\plugins\\", 0)) w[L"__plugins\\" + f.key.substr(16)] = {m, j};
                }
            unordered_set<wstring> made;
            for (auto& [k, mj] : w) {
                F& f = ms[mj.first].f[mj.second];
                wstring d = t + L"\\r6\\scripts\\" + (f.key[1] == L'6' ? f.rel.substr(11) : L"__plugins\\" + f.rel.substr(16)), dd = d.substr(0, d.rfind(L'\\'));
                if (made.insert(dd).second) mkdirs(dd);
                if (!CopyFileW(fsp(ms[mj.first], f).c_str(), d.c_str(), FALSE)) throw Err{L"не скопировать " + disp(ms[mj.first].root + L"\\" + f.rel)};
                who[k] = mj.first;
            }
            er.clear();
            return sccrun(lib, t, er);
        };
        auto grp = [&](const vector<Q>& er, const unordered_set<wstring>* skip) {
            map<wstring, int> c;
            for (auto& e : er)
                if (!skip || !skip->count(e.k)) c[who.count(e.p) ? ms[who[e.p]].cat + L"\\" + ms[who[e.p]].name : L"?"]++;
            for (auto& [n, k] : c) wprintf(L"  %3d  %s\n", k, n.c_str());
            return c;
        };
        vector<int> sa, sb;
        for (int m : o) if (ms[m].ex && (ms[m].on || ms[m].off)) sa.push_back(m);
        vector<Q> ea0, eb;
        wprintf(L"\nпроверка скриптов (%s)\n", disp(lib).c_str());
        DWORD ra = cc(sa, ea0);
        size_t nf = who.size();
        auto sev = [&](const char* sg, bool ok, size_t n, const map<wstring, int>& c) {
            string b = "{";
            for (auto& [x, y] : c) b += (b.size() > 1 ? "," : "") + js(x) + ":" + to_string(y);
            O("scc").a("stage", sg).b("ok", ok).n("files", nf).n("errors", n).r("by", b + "}").go();
        };
        unordered_set<wstring> ka;
        for (auto& e : ea0) ka.insert(e.k);
        map<wstring, int> ma, mb;
        if (ra) wprintf(L"!! сборка и без вортекса не компилируется (файлов скриптов %zu), ошибок %zu, их надо чинить в сборке (обновить или выключить):\n", nf, ea0.size()), ma = grp(ea0, 0);
        else wprintf(L"сборка без вортекса: скрипты компилируются, файлов %zu\n", nf);
        sev("base", !ra, ea0.size(), ma);
        auto back = [&](int x) {
            for (auto& d : dups) if (d.v == x && ms[d.e].off) ms[d.e].on = true, ms[d.e].off = false;
            for (auto& a : acs) if (a.v == x && a.c == 2) ms[a.e].on = true, ms[a.e].off = false;
            for (auto [e, v] : rep) if (v == x && ms[e].off) ms[e].on = true, ms[e].off = false;
        };
        auto setb = [&](int x) {
            vector<int> r;
            for (int m : o)
                if (m != x && ms[m].on && !ms[m].skip) r.push_back(m);
                else if (x >= 0 && ms[m].off && (any_of(dups.begin(), dups.end(), [&](const D& d) { return d.v == x && d.e == m; }) || any_of(acs.begin(), acs.end(), [&](const A& a) { return a.v == x && a.e == m && a.c == 2; }) || find(rep.begin(), rep.end(), pair<int, int>{m, x}) != rep.end())) r.push_back(m);
            return r;
        };
        auto fresh = [&](const vector<Q>& er) { size_t n = 0; for (auto& e : er) n += !ka.count(e.k); return n; };
        for (int it = 0; it < 64; it++) {
            cc(sb = setb(-1), eb);
            nf = who.size();
            size_t nn = fresh(eb);
            if (!nn) break;
            vector<int> bad;
            for (auto& e : eb)
                if (!ka.count(e.k) && who.count(e.p) && !ms[who[e.p]].ex && find(bad.begin(), bad.end(), who[e.p]) == bad.end()) bad.push_back(who[e.p]);
            unordered_map<int, wstring> why;
            for (auto& e : eb) if (!ka.count(e.k) && who.count(e.p) && !why.count(who[e.p])) why[who[e.p]] = e.s;
            if (bad.empty()) {
                for (int m : sb) {
                    if (ms[m].ex || none_of(ms[m].f.begin(), ms[m].f.end(), [](const F& f) { return !f.drop && ends(f.key, L".reds"); })) continue;
                    vector<Q> ex;
                    cc(setb(m), ex);
                    if (fresh(ex) < nn) bad.push_back(m);
                }
                if (bad.empty())
                    for (int m : sb) if (!ms[m].ex && any_of(ms[m].f.begin(), ms[m].f.end(), [](const F& f) { return !f.drop && ends(f.key, L".reds"); })) bad.push_back(m);
            }
            if (bad.empty()) break;
            for (int m : bad) {
                ms[m].on = false, ms[m].why = why.count(m) ? L"скрипты не компилируются: " + why[m] : L"с ним не компилируются скрипты других модов", vbad.push_back(m);
                back(m);
            }
        }
        if (fresh(eb)) cc(setb(-1), eb);
        if (size_t nn = fresh(eb)) wprintf(L"!! после переноса остались новые ошибки скриптов: %zu\n", nn), mb = grp(eb, &ka);
        else if (vbad.empty()) wprintf(L"моды вортекса скрипты не ломают, файлов скриптов вместе с ними %zu\n", nf);
        sev("final", !fresh(eb), fresh(eb), mb);
        if (!vbad.empty()) wprintf(L"моды вортекса, которые ломают скрипты, перенесу выключенными:\n");
        for (int m : vbad) wprintf(L"  - %s: %s\n", ms[m].name.c_str(), ms[m].why.c_str());
        rmtree(t);
        break;
    }
    auto mev = [&](int i, size_t n) {
        M& m = ms[i];
        wstring w = m.why;
        const char* ac = m.ex ? m.off ? "disable" : "keep" : m.skip ? "skip" : m.on ? "add" : "add_off";
        auto lk = [&](int e, int v) {
            if (ms[e].off && ms[v].on && !ms[v].skip && (e == i || v == i)) ac = m.ex ? "disable" : "replace", w = m.ex ? L"заменён модом вортекса " + ms[v].name : L"заменяет мод сборки " + ms[e].name;
            else if (m.skip && v == i) w = L"уже есть в сборке: " + ms[e].name;
        };
        for (auto& d : dups) lk(d.e, d.v);
        for (auto& a : acs) if (a.c == 2) lk(a.e, a.v);
        for (auto [e, v] : rep) lk(e, v);
        if (w.empty() && !m.ex && !m.on && !m.skip) w = mo2 ? L"выключен в профиле MO2" : L"выключен в vortex";
        O("mod").r("i", n ? to_string(n) : "null").a("from", m.ex ? "exl" : "vortex").a("action", ac).b("on", m.on).s("name", m.name).s("dir", m.dir).s("cat", m.cat).s("ver", m.ver)
            .s("date", m.date).n("nid", m.nid).s("note", w).s("src", disp(m.root)).r("dst", m.skip ? "null" : js(disp(out + L"\\" + m.cat + L"\\" + m.dir))).go();
    };
    wprintf(L"\nпорядок, последний побеждает:\n");
    for (size_t i = 0; i < o.size(); i++) wprintf(L"%4zu %s %s\\%s\n", i + 1, ms[o[i]].on ? L"+" : L"-", ms[o[i]].cat.c_str(), ms[o[i]].dir.c_str());
    if (jo) {
        for (size_t i = 0; i < o.size(); i++) mev(o[i], i + 1);
        for (int i = ne; i < (int)ms.size(); i++) if (ms[i].skip) mev(i, 0);
    }
    if (nvv) wprintf(L"\nконфликты внутри вортекса, проигравший -> победитель:\n");
    for (size_t i = 0; i < nvv; i++) {
        wprintf(L"  %s: %s -> %s%s\n", ms[es[i].from].f[es[i].fi].rel.c_str(), ms[es[i].from].dir.c_str(), ms[es[i].to].dir.c_str(), es[i].cut ? L"  [не копируется]" : L"");
        O("vconf").s("file", ms[es[i].from].f[es[i].fi].rel).s("loser", ms[es[i].from].dir).s("winner", ms[es[i].to].dir).b("cut", es[i].cut).go();
    }
    {
        unordered_map<wstring, int> fin;
        for (int i : o) if (ms[i].on && !ms[i].skip) for (auto& f : ms[i].f) if (!f.drop) fin[f.key] = i;
        size_t ns = 0, tb = 0, lost = 0, df = 0;
        wstring ex;
        for (auto& [k, w] : win) {
            auto wm = mi.find(w);
            if (wm == mi.end() || !own.count(k)) continue;
            auto it = fin.find(k);
            if (it == fin.end()) lost++;
            else if (ms[it->second].ex) tb++;
            else if (it->second == wm->second) ns++;
            else df++, ex = k;
        }
        wprintf(L"\nсверка с vortex: файлов как в vortex %zu, берёт сборка %zu, не попадут в игру %zu, другой победитель %zu\n", ns, tb, lost, df);
        O("verify").n("same", ns).n("build", tb).n("lost", lost).n("diff", df).go();
        if (df) wn(L"победитель не совпал с вортексом у " + to_wstring(df) + L" файлов, например " + ex);
    }
    if (!apply) return wprintf(L"\nэто план, --apply запишет\n"), sum(true), 0;
    if (!von && !voff) return wprintf(L"\nнечего переносить\n"), O("info").s("msg", L"нечего переносить").go(), sum(true), 0;

    if (mg && running(L"ExLauncher.exe")) throw Err{L"закрой ExLauncher, он перезапишет состояние сборки"};
    if (pmis) throw Err{L"активный профиль не совпадает с _activation_state.json, переключи профиль в лаунчере туда-обратно, закрой его и запусти снова"};
    if (running(mo2 ? L"ModOrganizer.exe" : L"Vortex.exe")) wn(mo2 ? L"MO2 открыт, не меняй в нём моды пока идёт копирование" : L"vortex открыт, не жми в нём deploy/purge пока идёт копирование");
    if (!mg && exists(parent + L"\\_vtx2exl_" + leaf)) throw Err{L"осталась прошлая попытка, удали руками: " + disp(parent + L"\\_vtx2exl_" + leaf)};
    wstring stage = mg ? out + L"\\_vtx2exl_tmp" : parent + L"\\_vtx2exl_" + leaf, croot = mg ? stage : stage + L"\\" + cat, jroot = mg ? out : stage;
    if (exists(stage)) throw Err{L"осталась прошлая попытка, удали руками: " + disp(stage)};
    wstring now = stamp(true);
    for (int i = ne; i < (int)ms.size(); i++) if (!ms[i].skip) for (auto& f : ms[i].f) tot += !f.drop;
    unordered_set<wstring> made;
    ph("copy", L"копирую моды");
    mkdirs(croot);
    for (int m : o) {
        if (ms[m].ex) continue;
        wstring md = croot + L"\\" + ms[m].dir;
        mkdirs(md);
        made.insert(md);
        for (auto& f : ms[m].f) {
            if (f.drop) continue;
            wstring src = fsp(ms[m], f), dst = md + L"\\" + f.rel, dd = dst.substr(0, dst.rfind(L'\\'));
            if (made.insert(dd).second) mkdirs(dd);
            if (CreateHardLinkW(dst.c_str(), src.c_str(), 0)) {
                if (!samef(src, dst)) throw Err{L"ссылка не сошлась с оригиналом: " + disp(dst)};
                nh++;
            } else {
                if (!CopyFileExW(src.c_str(), dst.c_str(), 0, 0, 0, COPY_FILE_FAIL_IF_EXISTS)) throw Err{L"не скопировать " + disp(src)};
                uint32_t a, b;
                uint64_t sa, sb;
                if (!fcrc(src, a, sa) || !fcrc(dst, b, sb) || a != b || sa != sb) throw Err{L"копия не сошлась с оригиналом: " + disp(dst)};
            }
            if (++done % 1000 == 0) wprintf(L"%zu/%zu\n", done, tot);
            prog("copy", done, tot, ms[m].dir);
        }
        wstring dn = ms[m].shown.empty() ? ms[m].name : ms[m].shown;
        for (auto& d : dups) if (d.v == m && ms[d.e].off) dn = ms[d.e].name;
        for (auto [e, v] : rep) if (v == m && ms[e].off) dn = ms[e].name;
        string meta = "{\"originalName\":" + js(ms[m].dir) + ",\"displayName\":" + js(dn) + ",\"origin\":\"user\",\"installedAt\":" + js(now);
        if (!ms[m].ver.empty()) meta += ",\"version\":" + js(ms[m].ver);
        if (!ms[m].why.empty()) meta += ",\"description\":" + js(srn(L"выключен при переносе: " + ms[m].why, false));
        else if (!ms[m].desc.empty()) meta += ",\"description\":" + js(ms[m].desc);
        if (!ms[m].auth.empty()) meta += ",\"author\":" + js(ms[m].auth);
        if (!ms[m].pic.empty()) meta += ",\"pictureUrl\":" + js(ms[m].pic);
        if (!ms[m].nex.empty()) meta += ",\"nexusName\":" + js(ms[m].nex);
        if (!ms[m].fj.empty()) meta += ",\"fomod\":" + ms[m].fj;
        if (ms[m].frz) meta += ",\"ignoreUpdatesUntil\":\"2036-01-01T00:00:00.0000000Z\"";
        if (ms[m].nid) {
            string id = to_string(ms[m].nid);
            meta += ",\"nexusModId\":\"" + id + "\",\"nexusGameDomain\":\"cyberpunk2077\",\"sourceUrl\":\"https://www.nexusmods.com/cyberpunk2077/mods/" + id + "\"";
            if (!ms[m].date.empty()) meta += ",\"nexusFileUploadedAt\":" + js(ms[m].date);
            if (ms[m].fid) meta += ",\"nexusFileId\":\"" + to_string(ms[m].fid) + "\"";
            if (!ms[m].fn.empty()) meta += ",\"nexusFileName\":" + js(ms[m].fn);
        } else if (!ms[m].url.empty()) meta += ",\"sourceUrl\":" + js(ms[m].url);
        J ads;
        ads.t = J::ARR;
        for (int e = 0; e < ne; e++) {
            if (!ms[e].off || ms[e].aj.t != J::ARR || (none_of(dups.begin(), dups.end(), [&](const D& d) { return d.v == m && d.e == e; }) && find(rep.begin(), rep.end(), pair<int, int>{e, m}) == rep.end())) continue;
            for (auto& ad : ms[e].aj.v) {
                J *af = ad.at("addedFiles"), *rf = ad.at("replacedFiles"), *dm = ad.at("displayName");
                wstring adn = dm ? W(dm->s) : L"?";
                if ((rf && rf->t == J::ARR && rf->v.size()) || !af || af->t != J::ARR) { wn(L"дополнение " + adn + L" мода " + ms[e].name + L" не перенесено: оно заменяет файлы мода, нужна версия под новый мод"); continue; }
                for (auto& x : af->v) {
                    wstring r = W(x.s);
                    replace(r.begin(), r.end(), L'/', L'\\');
                    wstring s = ms[e].root + L"\\" + r, d = md + L"\\" + r;
                    if (!exists(s) || exists(d)) continue;
                    mkdirs(d.substr(0, d.rfind(L'\\')));
                    if (!CreateHardLinkW(d.c_str(), s.c_str(), 0) && !CopyFileW(s.c_str(), d.c_str(), TRUE)) throw Err{L"не перенести дополнение " + disp(s)};
                }
                ads.v.push_back(ad);
                wprintf(L"дополнение %s перенесено из %s в %s\n", adn.c_str(), ms[e].name.c_str(), ms[m].name.c_str());
                O("info").s("msg", L"дополнение " + adn + L" перенесено из " + ms[e].name + L" в " + ms[m].name).go();
            }
        }
        if (ads.v.size()) {
            string o2;
            dump(ads, o2);
            meta += ",\"addons\":" + o2;
        }
        spit(md + L"\\_mod_meta.json", meta + "}\n");
        vector<F> fl;
        vector<wstring> sk;
        walk(md, L"", fl, sk, true);
        string sn = "{\"snapshotAt\":" + js(now.substr(0, 19)) + ",\"installMethod\":\"folder\",\"files\":[";
        for (size_t i = 0; i < fl.size(); i++) {
            wstring r = fl[i].rel;
            replace(r.begin(), r.end(), L'\\', L'/');
            string hx = sha256(md + L"\\" + fl[i].rel);
            if (hx.empty()) throw Err{L"не посчитать sha256 " + disp(md + L"\\" + fl[i].rel)};
            sn += (i ? ",{\"path\":" : "{\"path\":") + js(r) + ",\"hash\":\"" + hx + "\",\"size\":" + to_string(fl[i].sz) + "}";
        }
        spit(md + L"\\_mod_snapshot.json", sn + "]}\n");
    }

    ph("write", L"записываю сборку");
    J acts;
    acts.t = J::ARR;
    string mo = "[";
    for (size_t i = 0; i < o.size(); i++) {
        M& m = ms[o[i]];
        J a = m.ex ? ea[m.ei] : pj("{\"categoryName\":" + js(m.cat) + ",\"folderName\":" + js(m.dir) + "}");
        a.put("enabled", pj(m.on ? "true" : "false"));
        a.put("order", pj(to_string(i)));
        acts.v.push_back(move(a));
        if (!m.ex) mo += (mo.size() > 1 ? "," : "") + js(m.dir);
    }
    string sj;
    if (mo2) {
        unordered_set<int> ino(o.begin(), o.end());
        size_t sx = 0;
        mo = "[";
        for (int i = ne; i < (int)ms.size(); i++) {
            if (!ino.count(i)) continue;
            for (; sx < sps.size() && sps[sx].first <= ms[i].pri; sx++) {
                GUID gd;
                CoCreateGuid(&gd);
                wchar_t b[48];
                swprintf_s(b, L"__sep__%08lx%04hx%04hx%02x%02x%02x%02x%02x%02x%02x%02x", gd.Data1, gd.Data2, gd.Data3, gd.Data4[0], gd.Data4[1], gd.Data4[2], gd.Data4[3], gd.Data4[4], gd.Data4[5], gd.Data4[6], gd.Data4[7]);
                mo += (mo.size() > 1 ? "," : "") + js(b);
                sj += (sj.empty() ? "{\"id\":" : ",{\"id\":") + js(b) + ",\"title\":" + js(sps[sx].second) + ",\"lineColor\":\"\",\"titleColor\":\"\"}";
            }
            mo += (mo.size() > 1 ? "," : "") + js(ms[i].dir);
        }
    }
    spit(croot + L"\\_category.json", "{\"modOrder\":" + mo + "]" + (sj.empty() ? "" : ",\"separators\":[" + sj + "]") + "}\n");
    if (st.t != J::OBJ) st = pj("{\"buildName\":" + js(leaf) + "}");
    st.put("activations", acts);
    st.put("savedAt", pj(js(now)));
    if (pr.t != J::OBJ) pr = pj("{\"activeProfile\":\"default\",\"profiles\":{\"default\":{\"name\":\"default\"}}}");
    wstring npn;
    if (J *ps = pr.at("profiles"), *ap = pr.at("activeProfile"); ps && ap && ps->t == J::OBJ) {
        if (!mg) {
            if (J* cur = ps->at(ap->s.c_str())) cur->put("activations", acts);
        } else {
            for (auto& p : ps->v)
                if (J* pa = p.at("activations"); pa && pa->t == J::ARR)
                    for (int m : o) {
                        if (ms[m].ex) continue;
                        J x = pj("{\"categoryName\":" + js(ms[m].cat) + ",\"folderName\":" + js(ms[m].dir) + ",\"enabled\":false}");
                        x.put("order", pj(to_string(pa->v.size())));
                        pa->v.push_back(move(x));
                    }
            npn = W(ap->s) + L" + " + snm;
            for (int i = 2; ps->at(U(npn).c_str()); i++) npn = W(ap->s) + L" + " + snm + L" " + to_wstring(i);
            J nj = pj("{\"name\":" + js(npn) + "}");
            nj.put("activations", acts);
            ps->put(U(npn).c_str(), move(nj));
            pr.put("activeProfile", pj(js(npn)));
        }
    }
    if (bm.t != J::OBJ) bm = pj("{}");
    J* co = bm.at("categoryOrder");
    if (!co || co->t != J::ARR) co = &bm.put("categoryOrder", pj("[]"));
    co->v.push_back(pj(js(cat)));

    if (mg) {
        if (running(L"ExLauncher.exe")) throw Err{L"ExLauncher запустили во время копирования, закрой его и запусти снова (копию " + disp(stage) + L" можно удалить)"};
        for (int i = 0; i < 3; i++)
            if ((exists(out + jn[i]) ? slurp(out + jn[i]) : string()) != raw[i]) throw Err{L"сборка поменялась во время копирования, запусти снова (копию " + disp(stage) + L" можно удалить)"};
        wstring bk = parent + L"\\_vtx2exl.backup\\" + leaf + L"-" + stamp(false), b0 = bk;
        for (int i = 2; exists(bk); i++) bk = b0 + L"-" + to_wstring(i);
        mkdirs(bk);
        jbk = disp(bk);
        for (auto n : {L"_activation_state.json", L"_profiles.json", L"_build_meta.json"})
            if (exists(out + L"\\" + n) && !CopyFileW((out + L"\\" + n).c_str(), (bk + L"\\" + n).c_str(), TRUE)) throw Err{L"не сделать бэкап " + wstring(n)};
        spit(bk + L"\\_vtx2exl.json", "{\"category\":" + js(cat) + ",\"profile\":" + js(npn) + ",\"at\":" + js(now) + "}\n");
        if (!MoveFileExW(stage.c_str(), (out + L"\\" + cat).c_str(), 0)) throw Err{L"не переименовать " + disp(stage)};
        wprintf(L"бэкап json сборки: %s\nоткатить: vtx2exl --undo %s --apply\n", disp(bk).c_str(), disp(out).c_str());
        if (!npn.empty()) wprintf(L"новый профиль: %s, прежний профиль не тронут, моды вортекса добавлены в остальные профили выключенными\n", npn.c_str()), O("info").s("msg", L"новый профиль: " + npn).go();
    } else {
        GUID gd;
        CoCreateGuid(&gd);
        wchar_t gb[40];
        swprintf_s(gb, L"%08lx-%04hx-%04hx-%02x%02x-%02x%02x%02x%02x%02x%02x", gd.Data1, gd.Data2, gd.Data3, gd.Data4[0], gd.Data4[1], gd.Data4[2], gd.Data4[3], gd.Data4[4], gd.Data4[5], gd.Data4[6], gd.Data4[7]);
        spit(jroot + L"\\_build_info.json", "{\"buildId\":" + js(gb) + ",\"displayName\":" + js(title) + ",\"description\":" + js(L"из " + snm + L" " + now) + "}\n");
    }
    spit(jroot + L"\\_activation_state.json", dumps(st), mg);
    spit(jroot + L"\\_profiles.json", dumps(pr), mg);
    spit(jroot + L"\\_build_meta.json", dumps(bm), mg);
    if (!mg && !MoveFileExW(stage.c_str(), out.c_str(), 0)) throw Err{L"не переименовать " + disp(stage)};
    wprintf(L"\nготово: %s, файлов %zu (жёстких ссылок %zu, копий %zu, копии сверены по crc32c)\n", disp(out).c_str(), done, nh, done - nh);
    sum(true);
    return 0;
}

static void scan(const wstring& root, const wstring& rel, vector<wstring>& mk, vector<wstring>& bl) {
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW((root + L"\\" + rel + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, FIND_FIRST_EX_LARGE_FETCH);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        wstring n = fd.cFileName, r = rel + L"\\" + n;
        BY_HANDLE_FILE_INFORMATION i;
        if (n == L"." || n == L"..") continue;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) { if (fd.dwReserved0 == IO_REPARSE_TAG_SYMLINK && !fid(root + L"\\" + r, i, 0)) bl.push_back(r); }
        else if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) scan(root, r, mk, bl);
        else if (!_wcsicmp(n.c_str(), L"__folder_managed_by_vortex")) mk.push_back(r);
    } while (FindNextFileW(h, &fd));
    FindClose(h);
}

static int purge(const wstring& ga, bool apply) {
    wstring game = lp(ga), q = game.substr(0, game.rfind(L'\\')) + L"\\_vtx2exl.purge\\" + stamp(false);
    ph("scan", L"ищу файлы vortex в игре");
    J man = pj(slurp(game + L"\\vortex.deployment.json"));
    J *sp = man.at("stagingPath"), *fs = man.at("files");
    if (!sp || !fs || fs->t != J::ARR) throw Err{L"в vortex.deployment.json нет stagingPath/files"};
    wstring stg = lp(W(sp->s));
    vector<wstring> mv, cp, chg, gone, mk, bl;
    for (auto& x : fs->v) {
        J *rp = x.at("relPath"), *src = x.at("source");
        if (!rp || !src) continue;
        wstring r = W(rp->s), g;
        replace(r.begin(), r.end(), L'/', L'\\');
        g = game + L"\\" + r;
        BY_HANDLE_FILE_INFORMATION a, b;
        if (!exists(g)) { gone.push_back(r); continue; }
        if (!fid(g, a, FILE_FLAG_OPEN_REPARSE_POINT) || !fid(stg + L"\\" + W(src->s) + L"\\" + r, b, FILE_FLAG_OPEN_REPARSE_POINT) ||
            a.dwVolumeSerialNumber != b.dwVolumeSerialNumber || a.nFileIndexHigh != b.nFileIndexHigh || a.nFileIndexLow != b.nFileIndexLow) { chg.push_back(r); continue; }
        (exists(g + L".vortex_backup") ? cp : mv).push_back(r);
    }
    for (auto d : {L"archive", L"bin", L"engine", L"mods", L"r6", L"red4ext"}) scan(game, d, mk, bl);
    wprintf(L"папка игры: %s\nvortex: %s\n", disp(game).c_str(), disp(stg).c_str());
    wprintf(L"файлов vortex в игре: %zu, уберу в карантин\n", mv.size() + cp.size());
    for (auto& r : cp) wprintf(L"  ~ %s подменяет ванильный файл: оставлю в игре его текущую копию отдельным файлом, старый бэкап vortex уберу в карантин\n", r.c_str());
    for (auto& r : chg) wprintf(L"  ! %s поменялся после deploy (обновление игры?), не трогаю\n", r.c_str());
    if (!gone.empty()) wprintf(L"  уже нет в игре: %zu\n", gone.size());
    wprintf(L"меток __folder_managed_by_vortex: %zu, уберу в карантин\n", mk.size());
    for (auto& r : bl) wprintf(L"  битая ссылка, удалю: %s\n", r.c_str());
    wprintf(L"карантин: %s\n", disp(q).c_str());
    O("purge").s("game", disp(game)).s("vortex", disp(stg)).n("files", mv.size() + cp.size()).r("vanilla", jarr(cp)).r("changed", jarr(chg)).n("gone", gone.size()).n("markers", mk.size())
        .r("broken", jarr(bl)).s("quarantine", disp(q)).go();
    if (!apply) return wprintf(L"\nэто план, --purge ... --apply выполнит\n"), 0;
    for (auto e : {L"Vortex.exe", L"Cyberpunk2077.exe", L"ExLauncher.exe"})
        if (running(e)) throw Err{L"закрой " + wstring(e)};
    ph("purge", L"убираю в карантин");
    mkdirs(q);
    jbk = disp(q);
    if (!CopyFileW((game + L"\\vortex.deployment.json").c_str(), (q + L"\\vortex.deployment.json").c_str(), TRUE)) throw Err{L"не скопировать манифест"};
    string lg;
    auto to = [&](const wstring& src, const wstring& dst) {
        mkdirs(dst.substr(0, dst.rfind(L'\\')));
        if (!MoveFileExW(src.c_str(), dst.c_str(), 0)) throw Err{L"не перенести " + disp(src)};
    };
    try {
        for (auto& r : mv) to(game + L"\\" + r, q + L"\\vtx\\" + r), lg += "mv\t" + U(r) + "\n";
        for (auto& r : cp) {
            wstring g = game + L"\\" + r, t = g + L".vtx2exl";
            if (!CopyFileW(g.c_str(), t.c_str(), TRUE)) throw Err{L"не скопировать " + disp(g)};
            to(g, q + L"\\vtx\\" + r);
            if (!MoveFileExW(t.c_str(), g.c_str(), 0)) throw Err{L"не вернуть копию " + disp(g)};
            to(g + L".vortex_backup", q + L"\\vtx\\" + r + L".vortex_backup");
            lg += "cp\t" + U(r) + "\n";
        }
        for (auto& r : mk) to(game + L"\\" + r, q + L"\\mk\\" + r), lg += "mk\t" + U(r) + "\n";
        for (auto& r : bl) {
            wstring p = game + L"\\" + r;
            if (!(GetFileAttributesW(p.c_str()) & FILE_ATTRIBUTE_DIRECTORY ? RemoveDirectoryW(p.c_str()) : DeleteFileW(p.c_str()))) throw Err{L"не удалить ссылку " + disp(p)};
            lg += "rm\t" + U(r) + "\n";
        }
    } catch (Err&) {
        spit(q + L"\\purge.log", lg);
        throw;
    }
    spit(q + L"\\purge.log", lg);
    wprintf(L"\nготово, журнал: %s\\purge.log\nвернуть как было: robocopy \"%s\\vtx\" \"%s\" /e /move  и  robocopy \"%s\\mk\" \"%s\" /e /move\n", disp(q).c_str(), disp(q).c_str(), disp(game).c_str(), disp(q).c_str(), disp(game).c_str());
    return 0;
}

static int undo(const wstring& oa, bool apply) {
    wstring out = lp(oa), parent = out.substr(0, out.rfind(L'\\')), leaf = out.substr(out.rfind(L'\\') + 1), bd = parent + L"\\_vtx2exl.backup", bk;
    jbd = disp(out);
    if (!regex_match(leaf, wregex(L"[A-Za-z0-9_-]+"))) throw Err{L"имя папки сборки: только латиница, цифры, _ и -"};
    wregex rn(leaf + L"-\\d{8}-\\d{6}(-\\d+)?");
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW((bd + L"\\*").c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, 0, 0);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            wstring n = fd.cFileName;
            if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && regex_match(n, rn) && exists(bd + L"\\" + n + L"\\_vtx2exl.json") && n > bk) bk = n;
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    if (bk.empty()) throw Err{L"нечего откатывать, нет бэкапа переноса в " + disp(bd)};
    wstring b = bd + L"\\" + bk;
    J r = pj(slurp(b + L"\\_vtx2exl.json"));
    J *c = r.at("category"), *p = r.at("profile");
    if (!c || c->s.empty()) throw Err{L"в _vtx2exl.json нет категории"};
    wstring cat = W(c->s), ud = parent + L"\\_vtx2exl.undone\\" + bk + L"-" + cat;
    wprintf(L"откат переноса %s в %s\n", bk.c_str(), disp(out).c_str());
    wprintf(L"  json сборки вернутся из бэкапа: всё, что поменяли в лаунчере после переноса, пропадёт\n");
    if (p && !p->s.empty()) wprintf(L"  профиль %s пропадёт, активным станет прежний\n", W(p->s).c_str());
    wprintf(L"  категория %s %s\n", cat.c_str(), exists(out + L"\\" + cat) ? (L"уедет в " + disp(ud) + L", ничего не удаляется").c_str() : L"уже убрана");
    O("undo").s("backup", disp(b)).s("category", cat).r("profile", p && !p->s.empty() ? js(W(p->s)) : "null").b("present", exists(out + L"\\" + cat)).s("to", disp(ud)).go();
    if (!apply) return wprintf(L"\nэто план, --undo ... --apply откатит\n"), 0;
    if (running(L"ExLauncher.exe")) throw Err{L"закрой ExLauncher, он перезапишет состояние сборки"};
    for (auto n : {L"_activation_state.json", L"_profiles.json", L"_build_meta.json"})
        if (exists(b + L"\\" + n)) spit(out + L"\\" + n, slurp(b + L"\\" + n), true);
    if (exists(out + L"\\" + cat)) {
        mkdirs(parent + L"\\_vtx2exl.undone");
        if (exists(ud)) throw Err{L"уже есть " + disp(ud)};
        if (!MoveFileExW((out + L"\\" + cat).c_str(), ud.c_str(), 0)) throw Err{L"не перенести " + disp(out + L"\\" + cat)};
        jbk = disp(ud);
    }
    if (!MoveFileExW(b.c_str(), (b + L".used").c_str(), 0)) throw Err{L"не пометить бэкап " + disp(b)};
    wprintf(L"\nоткачено, перенесённые моды лежат в %s\n", disp(ud).c_str());
    return 0;
}

static int selftest() {
    int bad = 0;
    auto ck = [&](bool ok, const wchar_t* s) { if (!ok) wprintf(L"FAIL %s\n", s), O("error").s("msg", L"FAIL " + wstring(s)).go(), bad++; };
    const char v[] = "123456789";
    ck(crc32c_sw(0, v, 9) == 0xE3069283u, L"crc sw");
    if (sse42()) {
        uint8_t big[1037];
        for (int i = 0; i < 1037; i++) big[i] = (uint8_t)(i * 7 + 3);
        ck(crc32c_hw(0, v, 9) == 0xE3069283u, L"crc hw");
        ck(crc32c_hw(crc32c_hw(0, v, 5), v + 5, 4) == 0xE3069283u, L"crc hw chain");
        ck(crc32c_hw(0, big + 1, 1035) == crc32c_sw(0, big + 1, 1035), L"crc hw tail");
    }
    J j = pj(R"({"a":"x\\yé","b":[1,true,null],"c":{"d":"\ud83d\ude00"},"n":-1.5e3})");
    ck(j.at("a") && j.at("a")->s == "x\\y\xC3\xA9", L"json esc");
    ck(j.at("b") && j.at("b")->v.size() == 3 && j.at("b")->v[1].b, L"json arr");
    ck(j.at("c") && j.at("c")->at("d") && j.at("c")->at("d")->s == "\xF0\x9F\x98\x80", L"json utf16");
    ck(dumps(j) == "{\"a\":\"x\\\\y\xC3\xA9\",\"b\":[1,true,null],\"c\":{\"d\":\"\xF0\x9F\x98\x80\"},\"n\":-1.5e3}\n", L"json dump");
    ck(js(L"q\"b\\c\x01\n\U0001F600") == "\"q\\\"b\\\\c\\u0001\\u000a\xF0\x9F\x98\x80\"", L"json out esc");
    ck(pj(js(wstring{L'x', (wchar_t)0xD800, L'y'})).s == "x\xEF\xBF\xBDy", L"json lone surrogate");
    ck(O("e").s("k", L"\x7f\x1f").n("n", -1).b("b", true).r("z", "null").str() == "{\"t\":\"e\",\"k\":\"\x7f\\u001f\",\"n\":-1,\"b\":true,\"z\":null}", L"json event");
    dec = pj(R"({"dup:a/b|c":"take","x":"each"})"), du.assign(2, 0);
    ck(dget(L"dup:a/b|c", 2, okd) == 2 && !dget(L"y", 2, okd) && du[0] && !du[1], L"decisions");
    dec = J(), du.clear();
    M m;
    m.dir = L"02_GYMFIEND_VTK-6423-1-4-2--1740164701";
    nm(m);
    ck(m.name == L"02_GYMFIEND_VTK" && m.nid == 6423 && m.ver == L"1.4.2" && m.date == L"2025-02-21", L"dir name");
    M r;
    r.dir = L"RadioExt 2.92 4591 2.92 2026-10-25T20-46Z YfTif77t6";
    nm(r);
    ck(r.name == L"RadioExt" && r.ver == L"2.92" && r.nid == 4591 && r.date == L"2026-10-25", L"dir name loose");
    M s;
    s.dir = L"Manual - Rus Dub DreamVoice 5.3.1";
    nm(s);
    ck(s.name == L"Manual - Rus Dub DreamVoice" && s.ver == L"5.3.1" && !s.nid, L"dir name manual");
    ck(vcmp(L"1.27.1", L"1.26.1") > 0 && !vcmp(L"1.20.3", L"1.20.3") && vcmp(L"0.9.9", L"0.9.10") < 0 && vcmp(L"1.2", L"1.2.0.1") < 0 && !vcmp(L"", L"1"), L"vcmp");
    vector<M> a(3), c(2), x(3);
    a[0].dir = L"A", a[1].dir = L"B", a[2].dir = L"C", c[0].dir = L"X", c[1].dir = L"Y";
    for (auto& q : a) q.on = true, q.f.resize(1);
    for (auto& q : c) q.on = true, q.f.resize(1);
    vector<E> ea{{0, 2, 0}, {1, 0, 0}}, ec{{0, 1, 0}, {1, 0, 0}};
    ck(order(a, ea) == vector<int>{1, 0, 2}, L"order");
    ck(order(c, ec).size() == 2 && c[0].f[0].drop && c[1].f[0].drop, L"cycle");
    x[0].ex = x[1].ex = true, x[0].ei = 0, x[1].ei = 1, x[2].dir = L"V";
    for (auto& q : x) q.on = true, q.f.resize(2);
    vector<E> ex{{0, 1, -1}, {1, 2, 0}, {2, 0, 1}};
    ck(order(x, ex) == vector<int>{0, 1, 2} && x[2].f[1].drop && !x[0].f[0].drop && !x[1].f[0].drop, L"cycle exl untouched");
    ck(qv("@ByteArray(C:\\\\Games\\\\Cyber)") == L"C:\\Games\\Cyber", L"qt bytearray");
    ck(qv("@ByteArray(C:\\\\\\xd0\\x98)") == L"C:\\\u0418", L"qt5 bytes");
    ck(qv(U(L"@ByteArray(\u00d0\u0098)")) == L"\u0418", L"qt6 bytes");
    ck(qv("\"a, \\\"b\\\"\"") == L"a, \"b\"", L"qt quotes");
    auto ml = mlist("# x\r\n+a b\r\n-c\r\n*d\r\ne\r\n+A B\r\n+Overwrite\n");
    ck(ml.size() == 4 && ml[0].first == L"a b" && ml[0].second == L'+' && ml[1].second == L'-' && ml[2].second == L'*' && ml[3].first == L"e" && ml[3].second == L'+', L"modlist");
    ck(mver(L"1.2.0.0") == L"1.2" && mver(L"v1.10.0") == L"1.10" && mver(L"d2023.5.17") == L"2023.5.17" && mver(L"f1.05") == L"1.05" && mver(L"1.0") == L"1.0", L"mo2 version");
    vector<F> mf{{L"meta.ini", L"meta.ini"}, {L"a.archive.mohidden", L"a.archive.mohidden"}, {L"root\\bin\\x.dll", L"root\\bin\\x.dll"}, {L"bin\\x.dll", L"bin\\x.dll"}, {L"r6\\cache\\f", L"r6\\cache\\f"}, {L"archive\\pc\\mod\\modlist.txt", L"archive\\pc\\mod\\modlist.txt"}, {L"r6\\scripts\\a.reds", L"r6\\scripts\\a.reds"}};
    mfilt(mf, true);
    ck(mf.size() == 2 && mf[0].key == L"bin\\x.dll" && !mf[0].up && mf[1].key == L"r6\\scripts\\a.reds", L"mo2 filter");
    wstring fx = L"<moduleName>Mod</moduleName><installStep name=\"S\"><group name=\"A\" type=\"SelectExactlyOne\"><plugin name=\"X &amp; 1\"></plugin><plugin name=\"Y\"></plugin></group><group name=\"B\" type=\"SelectExactlyOne\"><plugin name=\"Y\"></plugin><plugin name=\"Z\"></plugin></group></installStep>", fm;
    J ok1 = pj(R"({"options":[{"name":"S","groups":[{"name":"A","choices":[{"name":"X & 1","idx":0}]},{"name":"B","choices":[{"name":"Z","idx":1}]}]}]})"), bad1 = pj(R"({"options":[{"name":"S","groups":[{"name":"A","choices":[{"name":"X & 1","idx":0}]},{"name":"B","choices":[{"name":"Y","idx":0}]}]}]})"), gone1 = pj(R"({"options":[{"name":"S2","groups":[{"name":"A","choices":[{"name":"X & 1","idx":0}]}]}]})");
    ck(fsafe(fx, ok1, fm) && fm == L"Mod", L"fomod safe");
    ck(!fsafe(fx, bad1, fm), L"fomod shared name");
    ck(!fsafe(fx, gone1, fm), L"fomod renamed step");
    wprintf(L"selftest %s\n", bad ? L"FAIL" : L"ok");
    return bad;
}

int wmain(int argc, wchar_t** argv) {
    if (argc == 5 && !wcscmp(argv[1], L"--scc")) return sccx(argv[2], argv[3], argv[4]);
    bool jm = false;
    for (int i = 1; i < argc; i++) jm |= !wcscmp(argv[i], L"--json");
    if (int f = jm ? _dup(1) : -1; f >= 0) jo = (HANDLE)_get_osfhandle(f), _dup2(2, 1);
    DWORD cm;
    _setmode(_fileno(stdout), GetConsoleMode((HANDLE)_get_osfhandle(_fileno(stdout)), &cm) ? _O_U16TEXT : _O_U8TEXT);
    _setmode(_fileno(stderr), GetConsoleMode((HANDLE)_get_osfhandle(_fileno(stderr)), &cm) ? _O_U16TEXT : _O_U8TEXT);
    int rc = 2;
    try {
        vector<wstring> pos, xt;
        bool apply = false, chk = false, un = false, pg = false, st = false;
        int pol = 0;
        wstring title, df, inst, pn;
        for (int i = 1; i < argc; i++)
            if (!wcscmp(argv[i], L"--apply")) apply = true;
            else if (!wcscmp(argv[i], L"--keep")) pol = 1;
            else if (!wcscmp(argv[i], L"--take")) pol = 2;
            else if (!wcscmp(argv[i], L"--vortex")) pol = 4;
            else if (!wcscmp(argv[i], L"--extra") && i + 1 < argc) xt.push_back(argv[++i]);
            else if (!wcscmp(argv[i], L"--mo2") && i + 1 < argc) inst = argv[++i];
            else if (!wcscmp(argv[i], L"--profile") && i + 1 < argc) pn = argv[++i];
            else if (!wcscmp(argv[i], L"--check")) chk = true;
            else if (!wcscmp(argv[i], L"--undo")) un = true;
            else if (!wcscmp(argv[i], L"--purge")) pg = true;
            else if (!wcscmp(argv[i], L"--selftest")) st = true;
            else if (!wcscmp(argv[i], L"--json")) {}
            else if (!wcscmp(argv[i], L"--decisions") && i + 1 < argc) df = argv[++i];
            else if (!wcscmp(argv[i], L"--name") && i + 1 < argc) title = argv[++i];
            else pos.push_back(argv[i]);
        mo2 = !inst.empty();
        O("start").n("v", 1).a("source", mo2 ? "mo2" : "vortex").a("mode", st ? "selftest" : un ? "undo" : pg ? "purge" : "migrate").b("check", chk || apply).b("apply", apply)
            .r("policy", pol == 1 ? "\"keep\"" : pol == 2 ? "\"take\"" : pol == 4 ? "\"vortex\"" : "null").b("decisions", !df.empty()).go();
        if (!df.empty()) {
            if (!pol) throw Err{L"--decisions только вместе с --keep / --take / --vortex"};
            dec = pj(slurp(lp(df)));
            if (dec.t != J::OBJ) throw Err{L"--decisions: нужен объект {\"id конфликта\": \"вариант\"}"};
            du.assign(dec.k.size(), 0);
        }
        if (mo2 && pg) throw Err{L"--purge не для MO2: MO2 не кладёт файлы в папку игры"};
        if (st && argc == 2 + jm) rc = selftest();
        else if (un && pos.size() == 1) rc = undo(pos[0], apply);
        else if (pg && pos.size() == 1) rc = purge(pos[0], apply);
        else if (st || un || pg || pos.size() != (mo2 && pos.size() == 1 ? 1u : 2u)) fwprintf(stderr, L"vtx2exl --mo2 <экземпляр> [--profile имя] [<папка игры>] <папка сборки> [ключи как ниже]\n"), fwprintf(stderr, L"vtx2exl <папка игры> <папка сборки> [--check] [--apply] [--keep | --take | --vortex] [--extra папка]... [--name имя]\nvtx2exl --undo <папка сборки> [--apply]\nvtx2exl --purge <папка игры> [--apply]\nvtx2exl --selftest\n"), O("error").s("msg", L"неверные аргументы").go();
        else rc = run(pos.size() == 2 ? pos[0] : L"", pos.back(), apply, pol, title, chk || apply, xt, inst, pn);
    } catch (Err& e) {
        fwprintf(stderr, L"ошибка: %s\n", e.m.c_str());
        O("error").s("msg", e.m).go();
        rc = 1;
    }
    O("done").b("ok", !rc).n("code", rc).r("backup", jbk.empty() ? "null" : js(jbk)).r("build", jbd.empty() ? "null" : js(jbd)).go();
    return rc;
}
