package com.duali.dm3terminal.domain

import com.duali.dm3terminal.data.local.entities.*
import com.duali.dm3terminal.data.repository.DM3Repository
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MockDataSeeder @Inject constructor(
    private val repository: DM3Repository,
) {
    private val vietnameseNames = listOf(
        "Nguyễn Văn An", "Trần Thị Bình", "Lê Hoàng Cường", "Phạm Minh Đức", "Hoàng Thị Em",
        "Vũ Đình Phong", "Đặng Thanh Giang", "Bùi Quốc Hải", "Đỗ Thị Inh", "Ngô Văn Khoa",
        "Dương Thị Lan", "Lý Minh Mẫn", "Hồ Ngọc Nhi", "Trương Văn Oanh", "Phan Thị Phương",
        "Mai Đức Quang", "Võ Thị Rạng", "Đinh Công Sơn", "Lưu Thị Tâm", "Tạ Minh Uy",
        "Nguyễn Thị Vân", "Trần Đức Xuân", "Lê Thị Yến", "Phạm Văn Bảo", "Hoàng Ngọc Chi",
        "Vũ Thị Diệp", "Đặng Minh Giang", "Bùi Thị Hạnh", "Đỗ Quang Huy", "Ngô Thị Kim",
        "Dương Văn Long", "Lý Thị Mai", "Hồ Đức Nam", "Trương Thị Oanh", "Phan Văn Phúc",
        "Mai Thị Quỳnh", "Võ Minh Quân", "Đinh Thị Sen", "Lưu Văn Thắng", "Tạ Thị Uyên",
        "Nguyễn Đức Vinh", "Trần Thị Xuyến", "Lê Minh Yên", "Phạm Thị Ánh", "Hoàng Văn Bình",
        "Vũ Thị Cúc", "Đặng Văn Dũng", "Bùi Thị Hoa", "Đỗ Minh Khánh", "Ngô Thị Liên",
    )

    suspend fun seed() {
        val persons = mutableListOf<PersonEntity>()
        val credentials = mutableListOf<CredentialEntity>()

        vietnameseNames.forEachIndexed { i, name ->
            val pid = "person-${String.format("%03d", i + 1)}"
            persons.add(PersonEntity(personId = pid, name = name))

            // Each person gets 1-2 card credentials
            val uid = String.format("%08X", 0xA1B2C3D4 + i)
            credentials.add(
                CredentialEntity(
                    id = "cred-card-${String.format("%03d", i + 1)}",
                    personId = pid,
                    type = "card",
                    value = uid,
                )
            )
            if (i % 3 == 0) {
                val uid2 = String.format("%08X", 0xF1E2D3C4 + i)
                credentials.add(
                    CredentialEntity(
                        id = "cred-card2-${String.format("%03d", i + 1)}",
                        personId = pid,
                        type = "card",
                        value = uid2,
                    )
                )
            }
        }

        // 5 person groups
        val allPersonIds = persons.map { it.personId }
        val groups = listOf(
            PersonGroupEntity("group-all", JSONArray(allPersonIds).toString()),
            PersonGroupEntity("group-staff", JSONArray(allPersonIds.take(30)).toString()),
            PersonGroupEntity("group-management", JSONArray(allPersonIds.take(10)).toString()),
            PersonGroupEntity("group-visitors", JSONArray(allPersonIds.drop(40)).toString()),
            PersonGroupEntity("group-vip", JSONArray(allPersonIds.take(5)).toString()),
        )

        // 5 access rules
        val rules = listOf(
            AccessRuleEntity(
                ruleId = "rule-main-entrance",
                name = "Cổng chính - Nhân viên",
                doorIds = JSONArray(listOf("door-main-entrance")).toString(),
                personGroupIds = JSONArray(listOf("group-all")).toString(),
                scheduleJson = JSONObject().apply {
                    put("timezone", "Asia/Ho_Chi_Minh")
                    put("periods", org.json.JSONArray().apply {
                        put(JSONObject().apply {
                            put("days", JSONArray(listOf(1, 2, 3, 4, 5, 6, 7)))
                            put("start", "00:00")
                            put("end", "23:59")
                        })
                    })
                }.toString(),
                priority = 10,
            ),
            AccessRuleEntity(
                ruleId = "rule-office-hours",
                name = "Văn phòng - Giờ hành chính",
                doorIds = JSONArray(listOf("door-office", "door-main-entrance")).toString(),
                personGroupIds = JSONArray(listOf("group-staff")).toString(),
                scheduleJson = JSONObject().apply {
                    put("timezone", "Asia/Ho_Chi_Minh")
                    put("periods", org.json.JSONArray().apply {
                        put(JSONObject().apply {
                            put("days", JSONArray(listOf(1, 2, 3, 4, 5)))
                            put("start", "07:00")
                            put("end", "19:00")
                        })
                    })
                }.toString(),
                priority = 5,
            ),
            AccessRuleEntity(
                ruleId = "rule-server-room",
                name = "Phòng server - Ban quản lý",
                doorIds = JSONArray(listOf("door-server-room")).toString(),
                personGroupIds = JSONArray(listOf("group-management")).toString(),
                scheduleJson = null, // 24/7
                priority = 20,
            ),
            AccessRuleEntity(
                ruleId = "rule-parking",
                name = "Bãi xe",
                doorIds = JSONArray(listOf("door-parking")).toString(),
                personGroupIds = JSONArray(listOf("group-all")).toString(),
                scheduleJson = JSONObject().apply {
                    put("timezone", "Asia/Ho_Chi_Minh")
                    put("periods", org.json.JSONArray().apply {
                        put(JSONObject().apply {
                            put("days", JSONArray(listOf(1, 2, 3, 4, 5, 6, 7)))
                            put("start", "05:00")
                            put("end", "23:00")
                        })
                    })
                }.toString(),
                priority = 1,
            ),
            AccessRuleEntity(
                ruleId = "rule-vip-lounge",
                name = "Phòng VIP",
                doorIds = JSONArray(listOf("door-vip-lounge")).toString(),
                personGroupIds = JSONArray(listOf("group-vip")).toString(),
                scheduleJson = null,
                priority = 15,
                antiPassback = true,
            ),
        )

        repository.upsertPersons(persons)
        repository.upsertCredentials(credentials)
        repository.upsertGroups(groups)
        repository.upsertRules(rules)
    }
}
