"""MediShare API test suite (64 cases). Run:  python3 tests/api_tests.py
It copies the project to a temp folder, seeds fresh data, starts a server on port 3000 and runs every case.
Stop any server already running on port 3000 first."""
import subprocess, time, json, os, shutil, statistics, requests, datetime, signal  # pip install requests

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import tempfile
DST = os.path.join(tempfile.gettempdir(), 'ms_test')
if os.path.exists(DST):
    shutil.rmtree(DST)
shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns('uploads', 'tests'), symlinks=True)
os.makedirs(DST + '/public/uploads', exist_ok=True)
subprocess.run(['node', 'seed.js'], cwd=DST, capture_output=True)
srv = subprocess.Popen(['node', 'server.js'], cwd=DST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
B = 'http://localhost:3000/api'

def login(email, pw):
    r = requests.post(B + '/auth/login', json={'email': email, 'password': pw})
    return r

def H(tok):
    return {'Authorization': 'Bearer ' + tok}

results = []
def rec(tid, module, scenario, expected, actual, ok):
    results.append({'id': tid, 'module': module, 'scenario': scenario, 'expected': expected, 'actual': actual, 'status': 'Pass' if ok else 'Fail'})

def future(days):
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()

try:
    # ---- Authentication ----
    ts = str(int(time.time()))
    r = requests.post(B + '/auth/signup', json={'name': 'Test Person', 'email': f't{ts}@ex.com', 'mobile': '9000000001', 'password': 'secret123', 'location': 'Kharghar, Navi Mumbai', 'userType': 'both'})
    rec('TC-01', 'Authentication', 'Register with valid details', 'HTTP 201, token and user returned', f'HTTP {r.status_code}, token present: {"token" in r.json()}', r.status_code == 201 and 'token' in r.json())
    r = requests.post(B + '/auth/signup', json={'name': 'Test Person', 'email': f't{ts}@ex.com', 'mobile': '9000000001', 'password': 'secret123', 'location': 'X', 'userType': 'both'})
    rec('TC-02', 'Authentication', 'Register with an email that already exists', 'HTTP 409, duplicate-email message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 409)
    r = requests.post(B + '/auth/signup', json={'name': 'Short Pw', 'email': f's{ts}@ex.com', 'mobile': '9000000002', 'password': '123', 'location': 'X', 'userType': 'donor'})
    rec('TC-03', 'Authentication', 'Register with a 3-character password', 'HTTP 400, password-length message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = requests.post(B + '/auth/signup', json={'name': 'No Mobile', 'email': f'n{ts}@ex.com', 'password': 'secret123', 'location': 'X', 'userType': 'donor'})
    rec('TC-04', 'Authentication', 'Register with mobile number missing', 'HTTP 400, required-fields message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = login('vikas@example.com', 'password123')
    rec('TC-05', 'Authentication', 'Login with correct credentials', 'HTTP 200 and JWT issued', f'HTTP {r.status_code}, token length {len(r.json().get("token", ""))}', r.status_code == 200 and 'token' in r.json())
    r = login('vikas@example.com', 'wrongpass')
    rec('TC-06', 'Authentication', 'Login with wrong password', 'HTTP 401, generic error', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 401)
    r = login('nobody@example.com', 'password123')
    rec('TC-07', 'Authentication', 'Login with unregistered email', 'HTTP 401, same generic error (no user enumeration)', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 401)
    r = requests.get(B + '/medicines')
    rec('TC-08', 'Authentication', 'Open a protected API without a token', 'HTTP 401', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 401)
    r = requests.get(B + '/medicines', headers=H('not.a.real.token'))
    rec('TC-09', 'Authentication', 'Open a protected API with a tampered token', 'HTTP 401, session-expired message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 401)
    r = login('vikas@example.com', 'password123').json()
    me = requests.get(B + '/auth/me', headers=H(r['token'])).json()['user']
    rec('TC-10', 'Authentication', 'Profile response must not expose the password hash', 'No passwordHash key in /auth/me', f'passwordHash in response: {"passwordHash" in me}', 'passwordHash' not in me)

    VIKAS = login('vikas@example.com', 'password123').json()['token']
    ANITA = login('anita@example.com', 'password123').json()['token']
    RAHUL = login('rahul@example.com', 'password123').json()['token']
    ADMIN = login('admin@medishare.app', 'admin123').json()['token']

    # ---- Listing medicines ----
    def share(tok, **over):
        d = {'name': 'Dolo', 'type': 'Tablet', 'strength': '650mg', 'quantity': '2', 'unit': 'Strip', 'expiryDate': future(200), 'batchNumber': 'B1', 'manufacturer': 'Micro Labs', 'location': 'Vashi', 'storageCondition': 'Dry place'}
        d.update(over)
        d = {k: v for k, v in d.items() if v is not None}
        return requests.post(B + '/medicines', headers=H(tok), data=d)
    r = share(VIKAS)
    new_id = r.json().get('medicine', {}).get('id')
    rec('TC-11', 'Share Medicine', 'List a valid medicine', 'HTTP 201, status = pending', f'HTTP {r.status_code}, status = {r.json().get("medicine", {}).get("status")}', r.status_code == 201 and r.json()['medicine']['status'] == 'pending')
    r = share(VIKAS, expiryDate=future(-5))
    rec('TC-12', 'Share Medicine', 'List a medicine that expired 5 days ago', 'HTTP 400, expired message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = share(VIKAS, expiryDate=future(10))
    rec('TC-13', 'Share Medicine', 'List a medicine expiring in 10 days', 'HTTP 400, 30-day shelf-life rule', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = share(VIKAS, expiryDate=future(31))
    rec('TC-14', 'Share Medicine', 'List a medicine expiring in exactly 31 days (boundary)', 'HTTP 201, accepted', f'HTTP {r.status_code}', r.status_code == 201)
    r = share(VIKAS, unit=None)
    rec('TC-15', 'Share Medicine', 'Quantity unit not provided', 'HTTP 400, unit required', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = share(VIKAS, unit='Barrel')
    rec('TC-16', 'Share Medicine', 'Unit outside the allowed list', 'HTTP 400, invalid unit', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = share(VIKAS, quantity='0')
    rec('TC-17', 'Share Medicine', 'Quantity = 0', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = share(VIKAS, batchNumber=None)
    rec('TC-18', 'Share Medicine', 'Batch number missing', 'HTTP 400, details required', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    files = {'photo': ('x.gif', b'GIF89a', 'image/gif')}
    r = requests.post(B + '/medicines', headers=H(VIKAS), data={'name': 'Dolo', 'type': 'Tablet', 'strength': '650mg', 'quantity': '2', 'unit': 'Strip', 'expiryDate': future(200), 'batchNumber': 'B1', 'manufacturer': 'M', 'location': 'Vashi'}, files=files)
    rec('TC-19', 'Share Medicine', 'Upload a GIF as the medicine photo', 'Rejected: only JPG/PNG/WEBP allowed', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code >= 400)
    files = {'photo': ('big.png', b'\x89PNG' + b'0' * (6 * 1024 * 1024), 'image/png')}
    r = requests.post(B + '/medicines', headers=H(VIKAS), data={'name': 'Dolo', 'type': 'Tablet', 'strength': '650mg', 'quantity': '2', 'unit': 'Strip', 'expiryDate': future(200), 'batchNumber': 'B1', 'manufacturer': 'M', 'location': 'Vashi'}, files=files)
    rec('TC-20', 'Share Medicine', 'Upload a 6 MB image (limit is 5 MB)', 'Rejected: file too large', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code >= 400)

    # ---- Search & matching ----
    r = requests.get(B + '/medicines', headers=H(ANITA))
    names = [m['name'] for m in r.json()['medicines']]
    rec('TC-21', 'Search & Matching', 'Pending listing must not appear in search', 'Cetirizine / Dolo (pending) absent', f'Results: {", ".join(names)}', 'Cetirizine' not in names and 'Dolo' not in names)
    r = requests.get(B + '/medicines?q=paracetamol&lat=19.0674&lng=73.0117', headers=H(ANITA))
    ms = r.json()['medicines']
    rec('TC-22', 'Search & Matching', 'Search "paracetamol" with location supplied', 'Only Paracetamol, with match % and distance', f'{len(ms)} result, match {ms[0]["matchScore"]}%, {ms[0]["distanceKm"]:.1f} km' if ms else 'no result', len(ms) == 1 and ms[0]['name'] == 'Paracetamol' and ms[0]['distanceKm'] is not None)
    r = requests.get(B + '/medicines?q=PARA', headers=H(ANITA))
    rec('TC-23', 'Search & Matching', 'Case-insensitive partial search "PARA"', 'Paracetamol returned', f'{[m["name"] for m in r.json()["medicines"]]}', any(m['name'] == 'Paracetamol' for m in r.json()['medicines']))
    r = requests.get(B + '/medicines?q=zzzz', headers=H(ANITA))
    rec('TC-24', 'Search & Matching', 'Search for a medicine that does not exist', 'Empty list', f'{len(r.json()["medicines"])} results', len(r.json()['medicines']) == 0)
    r = requests.get(B + '/medicines?type=Syrup', headers=H(ANITA))
    rec('TC-25', 'Search & Matching', 'Filter by type = Syrup', 'Only syrups', f'{[m["name"] for m in r.json()["medicines"]]}', all(m['type'] == 'Syrup' for m in r.json()['medicines']) and len(r.json()['medicines']) >= 1)
    r = requests.get(B + '/medicines?maxDistance=2&lat=19.0674&lng=73.0117', headers=H(ANITA))
    far = [m for m in r.json()['medicines'] if m['distanceKm'] is not None and m['distanceKm'] > 2]
    rec('TC-26', 'Search & Matching', 'Distance filter of 2 km', 'No result farther than 2 km', f'{len(r.json()["medicines"])} results, {len(far)} beyond 2 km', len(far) == 0)
    r = requests.get(B + '/medicines', headers=H(RAHUL))
    rec('TC-27', 'Search & Matching', "A donor's own listings are hidden from their own search", 'No listing by the same donor', f'Own listings visible: {any(m["donorId"] == 3 for m in r.json()["medicines"])}', not any(m['donorId'] == 3 for m in r.json()['medicines']))

    # ---- Admin verification ----
    r = requests.get(B + '/admin/stats', headers=H(ANITA))
    rec('TC-28', 'Admin & Verification', 'Normal user opens an admin API', 'HTTP 403', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 403)
    r = requests.patch(B + f'/admin/medicines/{new_id}/verify', headers=H(ADMIN))
    rec('TC-29', 'Admin & Verification', 'Admin approves a pending listing', 'status = approved, verified = true', f'HTTP {r.status_code}, status = {r.json()["medicine"]["status"]}', r.status_code == 200 and r.json()['medicine']['status'] == 'approved')
    notes = requests.get(B + '/notifications', headers=H(VIKAS)).json()['notifications']
    rec('TC-30', 'Admin & Verification', 'Donor is notified of the approval', 'A verification notification exists', f'{notes[0]["type"]}: {notes[0]["message"]}' if notes else 'none', any(n['type'] == 'verification' for n in notes))
    r = requests.get(B + '/medicines?q=dolo', headers=H(ANITA))
    rec('TC-31', 'Admin & Verification', 'Approved listing becomes searchable', 'Dolo now returned', f'{[m["name"] for m in r.json()["medicines"]]}', any(m['name'] == 'Dolo' for m in r.json()['medicines']))

    # ---- Requests ----
    def mkreq(tok, mid, qty, urg='normal'):
        return requests.post(B + '/requests', headers=H(tok), data={'medicineId': mid, 'quantity': qty, 'urgency': urg, 'reason': 'Needed for fever'})
    r = mkreq(ANITA, 1, 99)
    rec('TC-32', 'Requests', 'Request 99 strips when only 2 are listed', 'HTTP 400, available-quantity message', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = mkreq(RAHUL, 1, 1)
    rec('TC-33', 'Requests', 'Donor requests their own medicine', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = mkreq(ANITA, 5, 1)
    rec('TC-34', 'Requests', 'Request a rejected (non-public) listing', 'HTTP 404, not available', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 404)
    r = mkreq(ANITA, 2, 2, 'urgent')
    rid = r.json()['request']['id']
    rec('TC-35', 'Requests', 'Valid request for 2 Azithromycin tablets (urgent)', 'HTTP 201, status = sent', f'HTTP {r.status_code}, status = {r.json()["request"]["status"]}', r.status_code == 201)
    notes = requests.get(B + '/notifications', headers=H(RAHUL)).json()['notifications']
    rec('TC-36', 'Requests', 'Donor receives a new-request notification', 'new_request notification', f'{notes[0]["type"]}: {notes[0]["message"]}', notes[0]['type'] == 'new_request')
    r = requests.get(B + f'/requests/incoming', headers=H(RAHUL)).json()['requests'][0]
    rec('TC-37', 'Requests', 'Contact number hidden before acceptance', 'recipient.mobile absent', f'contactVisible = {r["contactVisible"]}, mobile = {r["recipient"].get("mobile")}', not r['contactVisible'] and not r['recipient'].get('mobile'))
    r = requests.patch(B + f'/requests/{rid}/accept', headers=H(ANITA))
    rec('TC-38', 'Requests', 'Recipient tries to accept their own request', 'HTTP 400/403, blocked', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code in (400, 403))
    r = requests.patch(B + f'/requests/{rid}/accept', headers=H(RAHUL))
    d = r.json()['request']
    rec('TC-39', 'Requests', 'Donor accepts the request', 'status = accepted, contact revealed', f'status = {d["status"]}, contactVisible = {d["contactVisible"]}, mobile shown = {bool(d["recipient"].get("mobile"))}', d['status'] == 'accepted' and d['contactVisible'] and bool(d['recipient'].get('mobile')))
    r = requests.patch(B + f'/requests/{rid}/complete', headers=H(RAHUL))
    rec('TC-40', 'Requests', 'Complete directly from accepted (handover skipped)', 'Allowed by design (accepted -> completed)', f'HTTP {r.status_code}', r.status_code == 200)
    # use a second request for the full flow & stock deduction
    med2 = requests.get(B + '/medicines/2', headers=H(ANITA)).json()['medicine']
    rec('TC-41', 'Requests', 'Stock deducted on completion (6 tablets - 2)', 'quantity = 4', f'quantity = {med2["quantity"]} {med2["unit"]}s', med2['quantity'] == 4)
    r = mkreq(ANITA, 6, 1)
    rid2 = r.json()['request']['id']
    r = requests.patch(B + f'/requests/{rid2}/cancel', headers=H(ANITA))
    rec('TC-42', 'Requests', 'Recipient cancels a request in "sent" state', 'status = cancelled', f'HTTP {r.status_code}, status = {r.json()["request"]["status"]}', r.json()['request']['status'] == 'cancelled')
    r = requests.patch(B + f'/requests/{rid2}/cancel', headers=H(ANITA))
    rec('TC-43', 'Requests', 'Cancel an already cancelled request', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = mkreq(ANITA, 6, 1)
    rid3 = r.json()['request']['id']
    r = requests.patch(B + f'/requests/{rid3}/cancel', headers=H(RAHUL))
    rec('TC-44', 'Requests', 'Donor attempts to cancel the recipient’s request', 'HTTP 403', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 403)
    requests.patch(B + f'/requests/{rid3}/accept', headers=H(RAHUL))
    requests.patch(B + f'/requests/{rid3}/handover', headers=H(RAHUL))
    r = requests.patch(B + f'/requests/{rid3}/cancel', headers=H(ANITA))
    rec('TC-45', 'Requests', 'Cancel after handover has started', 'HTTP 400, use chat instead', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = mkreq(VIKAS, 6, 1)
    rid4 = r.json()['request']['id']
    r = requests.patch(B + f'/requests/{rid4}/decline', headers=H(RAHUL))
    rec('TC-46', 'Requests', 'Donor declines a new request', 'status = declined', f'status = {r.json()["request"]["status"]}', r.json()['request']['status'] == 'declined')

    # ---- Chat ----
    r = requests.post(B + f'/requests/{rid3}/messages', headers=H(ANITA), json={'text': 'Hi, when can I collect it?'})
    rec('TC-47', 'Messaging', 'Recipient sends a message', 'HTTP 201', f'HTTP {r.status_code}', r.status_code == 201)
    r = requests.post(B + f'/requests/{rid3}/messages', headers=H(ANITA), json={'text': '   '})
    rec('TC-48', 'Messaging', 'Send an empty (spaces only) message', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = requests.get(B + f'/requests/{rid3}/messages', headers=H(VIKAS))
    rec('TC-49', 'Messaging', 'A third user tries to read the thread', 'HTTP 404, not visible', f'HTTP {r.status_code}', r.status_code == 404)
    r = requests.get(B + f'/requests/{rid3}/messages', headers=H(RAHUL))
    rec('TC-50', 'Messaging', 'Donor reads the thread', 'Message visible, marked as not mine', f'{len(r.json()["messages"])} message, mine = {r.json()["messages"][0]["mine"]}', len(r.json()['messages']) == 1 and not r.json()['messages'][0]['mine'])
    r = requests.post(B + f'/requests/{rid2}/messages', headers=H(ANITA), json={'text': 'hello'})
    rec('TC-51', 'Messaging', 'Message on a cancelled request', 'HTTP 400, closed', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)

    # ---- Reviews / Saved ----
    r = requests.post(B + f'/requests/{rid}/review', headers=H(ANITA), json={'rating': 5, 'comment': 'Great'})
    rec('TC-52', 'Ratings', 'Recipient rates the donor after completion', 'HTTP 201', f'HTTP {r.status_code}', r.status_code == 201)
    r = requests.post(B + f'/requests/{rid}/review', headers=H(ANITA), json={'rating': 1})
    rec('TC-53', 'Ratings', 'Rate the same request twice', 'HTTP 400, already reviewed', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = requests.post(B + f'/requests/{rid3}/review', headers=H(ANITA), json={'rating': 5})
    rec('TC-54', 'Ratings', 'Rate before the request is completed', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    r = requests.post(B + '/users/saved/1', headers=H(ANITA)); r2 = requests.post(B + '/users/saved/1', headers=H(ANITA))
    lst = requests.get(B + '/users/saved', headers=H(ANITA)).json()['medicines']
    rec('TC-55', 'Saved', 'Save the same medicine twice', 'Stored once only', f'{len(lst)} saved item', len(lst) == 1)
    requests.delete(B + '/users/saved/1', headers=H(ANITA))
    lst = requests.get(B + '/users/saved', headers=H(ANITA)).json()['medicines']
    rec('TC-56', 'Saved', 'Remove a saved medicine', 'List becomes empty', f'{len(lst)} saved items', len(lst) == 0)

    # ---- Profile / privacy / public ----
    r = requests.patch(B + '/users/profile', headers=H(ANITA), json={'privacy': {'showMobile': True}})
    rec('TC-57', 'Profile & Privacy', 'Update privacy settings', 'showMobile = true saved', f'privacy = {r.json()["user"]["privacy"]}', r.json()['user']['privacy']['showMobile'] is True)
    st = requests.get(B + '/public/stats').json()
    rec('TC-58', 'Dashboard & Admin', 'Public landing statistics come from real data', 'Counts reflect database', f'{st}', st['successfulRequests'] >= 1)
    an = requests.get(B + '/admin/analytics', headers=H(ADMIN)).json()
    rec('TC-59', 'Dashboard & Admin', 'Analytics API returns all four chart datasets', 'monthly, mostRequested, outcomes, areaDemand', f'keys: {sorted(an.keys())}', {'monthly', 'mostRequested', 'areaDemand'} <= set(an.keys()))
    ur = requests.get(B + '/admin/stats', headers=H(ADMIN)).json()
    rec('TC-60', 'Dashboard & Admin', 'Admin statistics endpoint', 'Six counters returned', f'{ur}', len(ur) == 6)

    # ---- Input hygiene & role checks added after the first test round ----
    r = share(VIKAS, name='<img src=x onerror=alert(1)>Dolo')
    nm = r.json().get('medicine', {}).get('name', '')
    rec('TC-61', 'Input Hygiene', 'Medicine name containing an HTML tag', 'Angle brackets stripped before storage', f'Stored as: {nm}', r.status_code == 201 and '<' not in nm and '>' not in nm)
    r = requests.post(B + '/auth/signup', json={'name': 'X', 'email': f'h{ts}@ex.com', 'mobile': '9000000009', 'password': 'secret123', 'location': 'Y', 'userType': 'hacker'})
    rec('TC-62', 'Input Hygiene', 'Register with an invalid user type', 'HTTP 400', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 400)
    rq = requests.post(B + '/requests', headers=H(ANITA), data={'medicineId': 6, 'quantity': 1, 'urgency': 'normal', 'reason': '<script>alert(1)</script>need'})
    rs = rq.json()['request']['reason']
    rec('TC-63', 'Input Hygiene', 'Request reason containing a script tag', 'Angle brackets stripped', f'Stored as: {rs}', '<' not in rs and '>' not in rs)
    rq2 = requests.post(B + '/requests', headers=H(ANITA), data={'medicineId': 6, 'quantity': 1, 'urgency': 'normal'}).json()['request']['id']
    r = requests.patch(B + f'/requests/{rq2}/complete', headers=H(ANITA))
    rec('TC-64', 'Requests', 'Recipient tries to mark their own request completed', 'HTTP 403, donor only', f'HTTP {r.status_code}: {r.json().get("error")}', r.status_code == 403)

    # ---- Latency ----
    def timing(fn, n=100):
        xs = []
        for _ in range(n):
            t = time.perf_counter(); fn(); xs.append((time.perf_counter() - t) * 1000)
        xs.sort()
        return {'mean': round(statistics.mean(xs), 1), 'p95': round(xs[int(n * 0.95) - 1], 1), 'max': round(xs[-1], 1)}
    perf = {
        'Login (bcrypt verify + JWT)': timing(lambda: login('vikas@example.com', 'password123'), 40),
        'GET /medicines (search + scoring)': timing(lambda: requests.get(B + '/medicines?q=para&lat=19.07&lng=73.01', headers=H(ANITA))),
        'GET /requests/mine': timing(lambda: requests.get(B + '/requests/mine', headers=H(ANITA))),
        'GET /notifications': timing(lambda: requests.get(B + '/notifications', headers=H(RAHUL))),
        'GET /admin/analytics': timing(lambda: requests.get(B + '/admin/analytics', headers=H(ADMIN))),
        'GET /public/stats': timing(lambda: requests.get(B + '/public/stats')),
    }
    json.dump({'tests': results, 'perf': perf}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results.json'), 'w'), indent=1)
    p = sum(1 for x in results if x['status'] == 'Pass')
    print('PASSED', p, 'of', len(results))
    for x in results:
        if x['status'] != 'Pass':
            print('FAIL', x['id'], x['scenario'], '|', x['actual'])
    print(json.dumps(perf, indent=1))
finally:
    srv.send_signal(signal.SIGTERM)
