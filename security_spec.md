# Explorer — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Identity & Ownership**:
   - `/users/{userId}`: Document ID `userId` MUST equal `request.auth.uid` and `incoming().uid == request.auth.uid`. No PII (emails/phones/addresses) is stored in `/users/{userId}`.
   - `/wishlists/{wishlistId}`: `userId` MUST equal `request.auth.uid` and `exists(/databases/$(database)/documents/users/$(request.auth.uid))` must hold on creation.
   - `/trips/{tripId}`: `userId` MUST equal `request.auth.uid` and `exists(/databases/$(database)/documents/users/$(request.auth.uid))` must hold on creation.
   - `/reviews/{reviewId}`: `authorId` MUST equal `request.auth.uid`, `rating` MUST be an integer between 1 and 5, and `createdAt == request.time`. Reviews are immutable once created.
   - `/callSessions/{sessionId}`: `travelerId` MUST equal `request.auth.uid` on creation, initial `status` MUST be `'ringing'`, and terminal states (`'rejected'`, `'completed'`) lock the document against any further updates.

2. **Strict Schema, Key Allowlisting & Volumetric Bounds**:
   - Every entity enforces `data.keys().hasAll([...]) && data.keys().hasOnly([...])` inside its standalone `isValid[Entity](data)` helper.
   - Every string enforces `.size()` limits matching `firebase-blueprint.json`.
   - Every ID enforces `isValidId(id)` matching `^[a-zA-Z0-9_\-]+$` and `.size() <= 128`.
   - All writes require `request.auth.token.email_verified == true`.
   - All timestamps (`createdAt`, `updatedAt`) strictly equal `request.time`.

3. **Query Enforcer (No Blanket Reads)**:
   - `/wishlists` and `/trips` `allow list` require `resource.data.userId == request.auth.uid`.
   - `/callSessions` `allow list` requires `resource.data.travelerId == request.auth.uid || resource.data.explorerId == request.auth.uid`.
   - `/reviews` `allow list` requires `resource.data.rating >= 1`.

---

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on UserProfile**:
   ```json
   {
     "uid": "user_123",
     "displayName": "Alex",
     "domainRole": "traveler",
     "preferredLanguage": "en",
     "preferredCurrency": "USD",
     "streakScore": 10,
     "creditsBalance": 100,
     "spotsVisitedCount": 1,
     "isAdmin": true
   }
   ```
2. **Identity Spoofing on WishlistItem**:
   ```json
   {
     "userId": "victim_uid_999",
     "placeId": "place_kyoto_1",
     "placeName": "Gion Corner",
     "city": "Kyoto",
     "moodCategory": "Serene",
     "estimatedCostUsd": 45,
     "lat": 35.0037,
     "lng": 135.7785,
     "notes": "Spoofed owner"
   }
   ```
3. **Unverified Email Write**:
   - Request with `request.auth.token.email_verified == false` attempting to create `/users/user_123`.
4. **ID Poisoning Attack**:
   - Creating `/wishlists/invalid$id!with*spaces` or a 1024-char document ID.
5. **Terminal State Mutation on CallSession**:
   - Updating a `/callSessions/{sessionId}` document whose existing `status` is `'completed'` or `'rejected'`.
6. **Out-of-Range Rating on SpotReview**:
   ```json
   {
     "authorId": "user_123",
     "authorName": "Alex",
     "explorerId": "exp_kyoto_1",
     "placeName": "Fushimi Inari",
     "rating": 999,
     "comment": "Invalid star rating",
     "languageCode": "en",
     "hasVideoRecap": true
   }
   ```
7. **Timestamp Forgery Attack**:
   - Creating `/trips/trip_1` with `createdAt` set to a past or future client timestamp (`!= request.time`).
8. **Immutable Field Mutation on SavedTrip**:
   - Updating `/trips/trip_1` where `incoming().userId != existing().userId` or `incoming().createdAt != existing().createdAt`.
9. **Value Poisoning on Update (`affectedKeys` Bypass Attempt)**:
   - Updating `/users/user_123` `displayName` with a 5,000-character string or a boolean.
10. **Orphaned Wishlist Creation**:
    - Creating `/wishlists/w_1` when `/users/$(request.auth.uid)` does not exist in Firestore.
11. **Unauthorized Blanket List Scraping**:
    - Listing `/trips` without filtering `where('userId', '==', request.auth.uid)`.
12. **State Shortcutting on CallSession**:
    - Creating a `/callSessions/{sessionId}` document directly in `'completed'` state instead of `'ringing'`.
