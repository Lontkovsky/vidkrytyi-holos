# Покриття початкового стрес-тесту

Machine-readable source: [attack-coverage.json](attack-coverage.json). Defense outcome and evidence state are independent. This is an incomplete implementation checkpoint, not an assertion that all subcases of an attack are covered. No ExternallyReviewed evidence exists.

| ID | Scenario | Defense outcome | Evidence state | Remaining work / risk |
|---|---|---|---|---|
| A01 | Повторні голоси однієї людини | PartiallyMitigated | AutomatedTested | Stale writable backup guard not yet implemented |
| A02 | Фіктивні голоси від власника або issuer | PartiallyMitigated | AutomatedTested | Compromised credential authority can admit fictitious persons; complete role/collusion tests pending |
| A03 | Встановлення вибору конкретної людини | PartiallyMitigated | AutomatedTested | Issuer links person to ciphertext; sufficient key collusion can decrypt; subset attack tests pending |
| A04 | Компрометація БД, логів і backups | PartiallyMitigated | NotTested | Full synthetic leak/reconstruction experiment and backup controls pending |
| A05 | Добровільне голосування видається за думку населення | PartiallyMitigated | AutomatedTested | UI/API/JSON/CSV/SVG consistency tested; external copies, screenshots and spreadsheet reinterpretation cannot be controlled |
| A06 | Маніпуляція формулюванням і контекстом | PartiallyMitigated | AutomatedTested | Malicious language suite and source/content removal policy tests pending |
| A07 | Дублікати та захоплення каталогу | PartiallyMitigated | NotTested | Mass publishing and quota bypass tests pending |
| A08 | Цензура та суперечливі історії | PartiallyMitigated | NotTested | Working observer, lawful tombstones and external read-only restoration not implemented |
| A09 | Підміна збірки та непрозоре управління | PartiallyMitigated | NotTested | Two-clean-build comparison, independent client monitor and release locking pending |
| A10 | Недоступність провайдера ідентифікації | PartiallyMitigated | AutomatedTested | Synthetic A/B, expiry races and bounded UI recovery tested; production adapters and real upstream independence await contracts |
| A11 | Купівля голосів і примус | KnownLimitation | NotTested | Belenios integration provides neither receipt-freeness nor coercion resistance; explicit limitation experiments pending |

Each record identifies trust boundaries, implementation, issues, tests and remaining acceptance criteria. KnownLimitation does not waive implementable controls. The current tests do not yet constitute the full A01–A11 adversarial suite.
